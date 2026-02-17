/**
 * Cloudflare Analytics and Cache tools
 */

import { z } from 'zod';
import axios from 'axios';
import { createServiceLogger } from '../../../utils/logger.js';
import { MCPError, ErrorCode } from '../../../types/errors.js';
import type { ToolDefinition } from '../../../types/tools.js';
import { ToolCategory } from '../../../types/tools.js';

const log = createServiceLogger('cloudflare-analytics');

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

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
// Get Analytics
// ============================================

const getAnalyticsSchema = z.object({
  zoneId: z.string().describe('Cloudflare Zone ID'),
  since: z.string().describe('Start time (ISO 8601 or relative like -1440 for last 24h in minutes)'),
  until: z.string().optional().describe('End time (ISO 8601 or relative)'),
});

type GetAnalyticsInput = z.infer<typeof getAnalyticsSchema>;

interface CFAnalyticsOutput {
  totals: {
    requests: {
      all: number;
      cached: number;
      uncached: number;
      ssl: { encrypted: number; unencrypted: number };
    };
    bandwidth: {
      all: number;
      cached: number;
      uncached: number;
    };
    threats: {
      all: number;
      types: Record<string, number>;
    };
    pageviews: {
      all: number;
      searchEngines: Record<string, number>;
    };
    uniques: {
      all: number;
    };
  };
  timeseries: {
    since: string;
    until: string;
    requests: { all: number; cached: number };
    bandwidth: { all: number };
    threats: { all: number };
    pageviews: { all: number };
    uniques: { all: number };
  }[];
}

export const cfGetAnalyticsTool: ToolDefinition<GetAnalyticsInput, CFAnalyticsOutput> = {
  name: 'cf_get_analytics',
  description: 'Gets analytics data for a Cloudflare zone',
  category: ToolCategory.CLOUDFLARE,
  inputSchema: getAnalyticsSchema,

  async handler(input: GetAnalyticsInput): Promise<CFAnalyticsOutput> {
    log.info('Getting Cloudflare analytics', { zoneId: input.zoneId });

    const params = new URLSearchParams();
    params.append('since', input.since);
    if (input.until) params.append('until', input.until);

    const response = await axios.get(
      `${CF_API_BASE}/zones/${input.zoneId}/analytics/dashboard?${params}`,
      {
        headers: getCloudflareHeaders(),
        timeout: 30000,
      }
    );

    const data = response.data;

    if (!data.success) {
      throw MCPError.externalServiceError('cloudflare', data.errors?.[0]?.message || 'Unknown error');
    }

    const result = data.result;
    const totals = result.totals || {};
    const timeseries = result.timeseries || [];

    const output: CFAnalyticsOutput = {
      totals: {
        requests: {
          all: totals.requests?.all || 0,
          cached: totals.requests?.cached || 0,
          uncached: totals.requests?.uncached || 0,
          ssl: {
            encrypted: totals.requests?.ssl?.encrypted || 0,
            unencrypted: totals.requests?.ssl?.unencrypted || 0,
          },
        },
        bandwidth: {
          all: totals.bandwidth?.all || 0,
          cached: totals.bandwidth?.cached || 0,
          uncached: totals.bandwidth?.uncached || 0,
        },
        threats: {
          all: totals.threats?.all || 0,
          types: totals.threats?.type || {},
        },
        pageviews: {
          all: totals.pageviews?.all || 0,
          searchEngines: totals.pageviews?.search_engine || {},
        },
        uniques: {
          all: totals.uniques?.all || 0,
        },
      },
      timeseries: timeseries.map((ts: Record<string, unknown>) => ({
        since: ts.since as string || '',
        until: ts.until as string || '',
        requests: {
          all: (ts.requests as Record<string, number>)?.all || 0,
          cached: (ts.requests as Record<string, number>)?.cached || 0,
        },
        bandwidth: { all: (ts.bandwidth as Record<string, number>)?.all || 0 },
        threats: { all: (ts.threats as Record<string, number>)?.all || 0 },
        pageviews: { all: (ts.pageviews as Record<string, number>)?.all || 0 },
        uniques: { all: (ts.uniques as Record<string, number>)?.all || 0 },
      })),
    };

    log.info('Retrieved Cloudflare analytics', {
      totalRequests: output.totals.requests.all,
      cacheRate: output.totals.requests.all > 0
        ? ((output.totals.requests.cached / output.totals.requests.all) * 100).toFixed(1) + '%'
        : '0%',
    });

    return output;
  },
};

// ============================================
// Purge Cache
// ============================================

const purgeCacheSchema = z.object({
  zoneId: z.string().describe('Cloudflare Zone ID'),
  purgeEverything: z.boolean().optional().describe('Purge all cached files'),
  files: z.array(z.string().url()).optional().describe('Specific URLs to purge'),
  tags: z.array(z.string()).optional().describe('Cache tags to purge'),
  hosts: z.array(z.string()).optional().describe('Hostnames to purge'),
  prefixes: z.array(z.string()).optional().describe('URL prefixes to purge'),
});

type PurgeCacheInput = z.infer<typeof purgeCacheSchema>;

interface PurgeCacheOutput {
  success: boolean;
  id: string;
}

export const cfPurgeCacheTool: ToolDefinition<PurgeCacheInput, PurgeCacheOutput> = {
  name: 'cf_purge_cache',
  description: 'Purges Cloudflare cache for a zone',
  category: ToolCategory.CLOUDFLARE,
  inputSchema: purgeCacheSchema,

  async handler(input: PurgeCacheInput): Promise<PurgeCacheOutput> {
    log.info('Purging Cloudflare cache', {
      zoneId: input.zoneId,
      purgeEverything: input.purgeEverything,
      filesCount: input.files?.length,
    });

    const requestBody: Record<string, unknown> = {};

    if (input.purgeEverything) {
      requestBody.purge_everything = true;
    } else {
      if (input.files) requestBody.files = input.files;
      if (input.tags) requestBody.tags = input.tags;
      if (input.hosts) requestBody.hosts = input.hosts;
      if (input.prefixes) requestBody.prefixes = input.prefixes;
    }

    if (Object.keys(requestBody).length === 0) {
      throw new MCPError({
        code: ErrorCode.INVALID_PARAMS,
        message: 'Must specify purgeEverything, files, tags, hosts, or prefixes',
        retryable: false,
        service: 'cloudflare',
      });
    }

    const response = await axios.post(
      `${CF_API_BASE}/zones/${input.zoneId}/purge_cache`,
      requestBody,
      {
        headers: getCloudflareHeaders(),
        timeout: 30000,
      }
    );

    const data = response.data;

    if (!data.success) {
      throw MCPError.externalServiceError('cloudflare', data.errors?.[0]?.message || 'Unknown error');
    }

    log.info('Purged Cloudflare cache', { id: data.result?.id });

    return {
      success: true,
      id: data.result?.id || '',
    };
  },
};
