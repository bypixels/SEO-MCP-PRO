/**
 * Cloudflare Firewall tools
 */

import { z } from 'zod';
import axios from 'axios';
import { createServiceLogger } from '../../../utils/logger.js';
import { MCPError, ErrorCode } from '../../../types/errors.js';
import type { ToolDefinition } from '../../../types/tools.js';
import { ToolCategory } from '../../../types/tools.js';

const log = createServiceLogger('cloudflare-firewall');

// CF_API_BASE moved to inline usage for GraphQL endpoint

/**
 * Get Cloudflare API headers
 */
function getCloudflareHeaders(): Record<string, string> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const email = process.env.CLOUDFLARE_EMAIL;
  const apiKey = process.env.CLOUDFLARE_API_KEY;

  if (apiToken) {
    return {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  if (email && apiKey) {
    return {
      'X-Auth-Email': email,
      'X-Auth-Key': apiKey,
      'Content-Type': 'application/json',
    };
  }

  throw new MCPError({
    code: ErrorCode.AUTH_NOT_CONFIGURED,
    message: 'Cloudflare credentials not configured. Set CLOUDFLARE_API_TOKEN or CLOUDFLARE_EMAIL and CLOUDFLARE_API_KEY.',
    retryable: false,
    service: 'cloudflare',
  });
}

// ============================================
// Get Firewall Events
// ============================================

const firewallEventsSchema = z.object({
  zoneId: z.string().describe('Cloudflare Zone ID'),
  since: z.string().optional().describe('Start time (ISO 8601)'),
  until: z.string().optional().describe('End time (ISO 8601)'),
  action: z.enum(['block', 'challenge', 'jschallenge', 'managed_challenge', 'allow', 'log'])
    .optional()
    .describe('Filter by action'),
  limit: z.number().min(1).max(1000).optional().describe('Maximum events to return'),
});

type FirewallEventsInput = z.infer<typeof firewallEventsSchema>;

interface CFFirewallEvent {
  action: string;
  clientIP: string;
  clientCountry: string;
  datetime: string;
  rayId: string;
  source: string;
  userAgent: string;
  uri: string;
  matches: {
    ruleId: string;
    ruleName: string;
    source: string;
  }[];
}

interface FirewallEventsOutput {
  events: CFFirewallEvent[];
  totalCount: number;
  summary: {
    blocked: number;
    challenged: number;
    allowed: number;
    topCountries: { country: string; count: number }[];
    topRules: { ruleId: string; ruleName: string; count: number }[];
  };
}

export const cfFirewallEventsTool: ToolDefinition<FirewallEventsInput, FirewallEventsOutput> = {
  name: 'cf_firewall_events',
  description: 'Gets firewall events for a Cloudflare zone',
  category: ToolCategory.CLOUDFLARE,
  inputSchema: firewallEventsSchema,

  async handler(input: FirewallEventsInput): Promise<FirewallEventsOutput> {
    log.info('Getting Cloudflare firewall events', { zoneId: input.zoneId });

    // Build GraphQL query for firewall events
    // Note: Cloudflare uses GraphQL API for analytics
    const since = input.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const until = input.until || new Date().toISOString();

    const query = `
      query {
        viewer {
          zones(filter: { zoneTag: "${input.zoneId}" }) {
            firewallEventsAdaptive(
              filter: {
                datetime_geq: "${since}",
                datetime_leq: "${until}"
                ${input.action ? `, action: "${input.action}"` : ''}
              },
              limit: ${input.limit || 100},
              orderBy: [datetime_DESC]
            ) {
              action
              clientIP
              clientCountryName
              datetime
              rayName
              source
              userAgent
              clientRequestPath
              ruleId
            }
          }
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://api.cloudflare.com/client/v4/graphql',
        { query },
        {
          headers: getCloudflareHeaders(),
          timeout: 30000,
        }
      );

      const data = response.data;

      if (data.errors && data.errors.length > 0) {
        log.warn('GraphQL errors', { errors: data.errors });
      }

      const rawEvents = data.data?.viewer?.zones?.[0]?.firewallEventsAdaptive || [];

      // Process events
      const events: CFFirewallEvent[] = rawEvents.map((e: Record<string, unknown>) => ({
        action: e.action as string || '',
        clientIP: e.clientIP as string || '',
        clientCountry: e.clientCountryName as string || '',
        datetime: e.datetime as string || '',
        rayId: e.rayName as string || '',
        source: e.source as string || '',
        userAgent: e.userAgent as string || '',
        uri: e.clientRequestPath as string || '',
        matches: [{
          ruleId: e.ruleId as string || '',
          ruleName: '',
          source: e.source as string || '',
        }],
      }));

      // Calculate summary
      const actionCounts = { blocked: 0, challenged: 0, allowed: 0 };
      const countryCount: Record<string, number> = {};
      const ruleCount: Record<string, { id: string; count: number }> = {};

      for (const event of events) {
        if (event.action === 'block') actionCounts.blocked++;
        else if (event.action.includes('challenge')) actionCounts.challenged++;
        else if (event.action === 'allow') actionCounts.allowed++;

        countryCount[event.clientCountry] = (countryCount[event.clientCountry] || 0) + 1;

        for (const match of event.matches) {
          if (match.ruleId) {
            if (!ruleCount[match.ruleId]) {
              ruleCount[match.ruleId] = { id: match.ruleId, count: 0 };
            }
            ruleCount[match.ruleId].count++;
          }
        }
      }

      const topCountries = Object.entries(countryCount)
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const topRules = Object.values(ruleCount)
        .map(({ id, count }) => ({ ruleId: id, ruleName: '', count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      log.info('Retrieved firewall events', {
        count: events.length,
        blocked: actionCounts.blocked,
      });

      return {
        events: events.slice(0, input.limit || 100),
        totalCount: events.length,
        summary: {
          ...actionCounts,
          topCountries,
          topRules,
        },
      };
    } catch (err) {
      log.error('Failed to get firewall events', { error: err instanceof Error ? err : new Error(String(err)) });

      // Return empty result on error
      return {
        events: [],
        totalCount: 0,
        summary: {
          blocked: 0,
          challenged: 0,
          allowed: 0,
          topCountries: [],
          topRules: [],
        },
      };
    }
  },
};
