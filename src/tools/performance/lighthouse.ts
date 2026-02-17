/**
 * Lighthouse Audit tool
 *
 * Runs programmatic Lighthouse audits for detailed performance analysis.
 */

import { z } from 'zod';
import axios from 'axios';
import { createServiceLogger } from '../../utils/logger.js';
import { MCPError } from '../../types/errors.js';
import type { ToolDefinition } from '../../types/tools.js';
import { ToolCategory } from '../../types/tools.js';

const log = createServiceLogger('lighthouse');

// ============================================
// Lighthouse Audit
// ============================================

const lighthouseAuditSchema = z.object({
  url: z.string().url().describe('URL to audit'),
  formFactor: z.enum(['mobile', 'desktop']).describe('Device form factor'),
  categories: z.array(z.enum(['performance', 'accessibility', 'best-practices', 'seo', 'pwa']))
    .optional()
    .describe('Categories to audit (default: all)'),
  throttling: z.object({
    cpuSlowdownMultiplier: z.number().optional().describe('CPU slowdown multiplier'),
    requestLatencyMs: z.number().optional().describe('Additional request latency in ms'),
    downloadThroughputKbps: z.number().optional().describe('Download speed in Kbps'),
    uploadThroughputKbps: z.number().optional().describe('Upload speed in Kbps'),
  }).optional().describe('Custom throttling settings'),
});

type LighthouseAuditInput = z.infer<typeof lighthouseAuditSchema>;

interface LighthouseOpportunity {
  id: string;
  title: string;
  description: string;
  savings: {
    bytes?: number;
    ms?: number;
  };
}

interface LighthouseDiagnostic {
  id: string;
  title: string;
  description: string;
  displayValue?: string;
  score: number | null;
}

interface LighthouseAuditOutput {
  url: string;
  fetchTime: string;
  formFactor: string;
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
    pwa?: number;
  };
  metrics: {
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    totalBlockingTime: number;
    cumulativeLayoutShift: number;
    speedIndex: number;
    timeToInteractive: number;
    firstMeaningfulPaint?: number;
    maxPotentialFID?: number;
  };
  opportunities: LighthouseOpportunity[];
  diagnostics: LighthouseDiagnostic[];
  passedAudits: number;
  failedAudits: number;
}

export const lighthouseAuditTool: ToolDefinition<LighthouseAuditInput, LighthouseAuditOutput> = {
  name: 'lighthouse_audit',
  description: 'Runs a comprehensive Lighthouse audit for performance, accessibility, SEO, best practices, and PWA',
  category: ToolCategory.PERFORMANCE,
  inputSchema: lighthouseAuditSchema,

  async handler(input: LighthouseAuditInput): Promise<LighthouseAuditOutput> {
    log.info('Running Lighthouse audit', { url: input.url, formFactor: input.formFactor });

    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;

    // Build categories parameter
    const categories = input.categories || ['performance', 'accessibility', 'best-practices', 'seo'];
    const categoryParams = categories.map(c => `category=${c.toUpperCase().replace('-', '_')}`).join('&');

    // Build PSI API URL (uses Lighthouse under the hood)
    const params = new URLSearchParams({
      url: input.url,
      strategy: input.formFactor.toUpperCase(),
    });

    if (apiKey) {
      params.append('key', apiKey);
    }

    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}&${categoryParams}`;

    const response = await axios.get(apiUrl, {
      timeout: 120000, // 2 minute timeout for Lighthouse
    });

    const data = response.data;
    const lighthouseResult = data.lighthouseResult;

    if (!lighthouseResult) {
      throw MCPError.externalServiceError('pagespeed', 'No Lighthouse result returned');
    }

    // Extract scores
    const cats = lighthouseResult.categories || {};
    const scores = {
      performance: Math.round((cats.performance?.score || 0) * 100),
      accessibility: Math.round((cats.accessibility?.score || 0) * 100),
      bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
      seo: Math.round((cats.seo?.score || 0) * 100),
      pwa: cats.pwa ? Math.round((cats.pwa.score || 0) * 100) : undefined,
    };

    // Extract metrics
    const audits = lighthouseResult.audits || {};
    const metrics = {
      firstContentfulPaint: audits['first-contentful-paint']?.numericValue || 0,
      largestContentfulPaint: audits['largest-contentful-paint']?.numericValue || 0,
      totalBlockingTime: audits['total-blocking-time']?.numericValue || 0,
      cumulativeLayoutShift: audits['cumulative-layout-shift']?.numericValue || 0,
      speedIndex: audits['speed-index']?.numericValue || 0,
      timeToInteractive: audits['interactive']?.numericValue || 0,
      firstMeaningfulPaint: audits['first-meaningful-paint']?.numericValue || undefined,
      maxPotentialFID: audits['max-potential-fid']?.numericValue || undefined,
    };

    // Extract opportunities (performance improvements)
    const opportunities: LighthouseOpportunity[] = [];
    const opportunityAudits = [
      'render-blocking-resources',
      'unused-css-rules',
      'unused-javascript',
      'modern-image-formats',
      'offscreen-images',
      'unminified-css',
      'unminified-javascript',
      'efficient-animated-content',
      'duplicated-javascript',
      'legacy-javascript',
      'uses-long-cache-ttl',
      'total-byte-weight',
      'uses-responsive-images',
      'uses-optimized-images',
      'uses-text-compression',
      'server-response-time',
      'redirects',
      'uses-rel-preconnect',
      'uses-rel-preload',
      'font-display',
      'third-party-summary',
    ];

    for (const auditId of opportunityAudits) {
      const audit = audits[auditId];
      if (audit && audit.score !== null && audit.score < 1) {
        const details = audit.details || {};
        const overallSavings = details.overallSavingsMs || details.overallSavingsBytes;

        if (overallSavings || audit.numericValue) {
          opportunities.push({
            id: auditId,
            title: audit.title || '',
            description: audit.description || '',
            savings: {
              bytes: details.overallSavingsBytes || undefined,
              ms: details.overallSavingsMs || audit.numericValue || undefined,
            },
          });
        }
      }
    }

    // Sort opportunities by potential savings
    opportunities.sort((a, b) => {
      const aSavings = (a.savings.ms || 0) + (a.savings.bytes || 0) / 1000;
      const bSavings = (b.savings.ms || 0) + (b.savings.bytes || 0) / 1000;
      return bSavings - aSavings;
    });

    // Extract diagnostics
    const diagnostics: LighthouseDiagnostic[] = [];
    const diagnosticAudits = [
      'mainthread-work-breakdown',
      'bootup-time',
      'dom-size',
      'critical-request-chains',
      'network-requests',
      'network-rtt',
      'network-server-latency',
      'resource-summary',
      'third-party-facades',
      'layout-shift-elements',
      'long-tasks',
      'non-composited-animations',
      'unsized-images',
      'viewport',
      'uses-passive-event-listeners',
    ];

    for (const auditId of diagnosticAudits) {
      const audit = audits[auditId];
      if (audit) {
        diagnostics.push({
          id: auditId,
          title: audit.title || '',
          description: audit.description || '',
          displayValue: audit.displayValue || undefined,
          score: audit.score,
        });
      }
    }

    // Count passed/failed audits
    let passedAudits = 0;
    let failedAudits = 0;

    for (const auditId in audits) {
      const audit = audits[auditId];
      if (audit.score !== null) {
        if (audit.score >= 0.9) {
          passedAudits++;
        } else {
          failedAudits++;
        }
      }
    }

    log.info('Lighthouse audit completed', {
      url: input.url,
      performanceScore: scores.performance,
      opportunities: opportunities.length,
    });

    return {
      url: input.url,
      fetchTime: lighthouseResult.fetchTime || new Date().toISOString(),
      formFactor: input.formFactor,
      scores,
      metrics,
      opportunities,
      diagnostics,
      passedAudits,
      failedAudits,
    };
  },
};
