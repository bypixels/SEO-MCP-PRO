/**
 * PageSpeed Insights tools
 */

import { z } from 'zod';
import axios from 'axios';
import { createServiceLogger } from '../../utils/logger.js';
import type { ToolDefinition } from '../../types/tools.js';
import { ToolCategory } from '../../types/tools.js';

const log = createServiceLogger('pagespeed');

// Get API key from environment
function getApiKey(): string | undefined {
  return process.env.GOOGLE_PAGESPEED_API_KEY;
}

// ============================================
// PSI Analyze
// ============================================

const psiAnalyzeSchema = z.object({
  url: z.string().url().describe('URL to analyze'),
  strategy: z.enum(['MOBILE', 'DESKTOP']).describe('Analysis strategy'),
  categories: z.array(z.enum(['ACCESSIBILITY', 'BEST_PRACTICES', 'PERFORMANCE', 'PWA', 'SEO']))
    .optional()
    .describe('Categories to analyze'),
  locale: z.string().optional().describe('Locale for results (e.g., en_US)'),
});

type PSIAnalyzeInput = z.infer<typeof psiAnalyzeSchema>;

interface FieldMetric {
  percentile: number;
  distributions: { min: number; max: number; proportion: number }[];
  category: 'FAST' | 'AVERAGE' | 'SLOW';
}

interface PSIAnalyzeOutput {
  lighthouseResult: {
    finalUrl: string;
    requestedUrl: string;
    fetchTime: string;
    categories: {
      performance?: { score: number };
      accessibility?: { score: number };
      'best-practices'?: { score: number };
      seo?: { score: number };
      pwa?: { score: number };
    };
    audits: Record<string, {
      id: string;
      title: string;
      description: string;
      score: number | null;
      scoreDisplayMode: string;
      displayValue?: string;
    }>;
  };
  loadingExperience?: {
    metrics: {
      CUMULATIVE_LAYOUT_SHIFT_SCORE?: FieldMetric;
      EXPERIMENTAL_TIME_TO_FIRST_BYTE?: FieldMetric;
      FIRST_CONTENTFUL_PAINT_MS?: FieldMetric;
      FIRST_INPUT_DELAY_MS?: FieldMetric;
      INTERACTION_TO_NEXT_PAINT?: FieldMetric;
      LARGEST_CONTENTFUL_PAINT_MS?: FieldMetric;
    };
    overall_category: 'FAST' | 'AVERAGE' | 'SLOW';
  };
  originLoadingExperience?: {
    metrics: Record<string, FieldMetric>;
    overall_category: 'FAST' | 'AVERAGE' | 'SLOW';
  };
}

export const psiAnalyzeTool: ToolDefinition<PSIAnalyzeInput, PSIAnalyzeOutput> = {
  name: 'psi_analyze',
  description: 'Analyzes page performance with PageSpeed Insights API',
  category: ToolCategory.PERFORMANCE,
  inputSchema: psiAnalyzeSchema,

  async handler(input: PSIAnalyzeInput): Promise<PSIAnalyzeOutput> {
    log.info('Running PageSpeed Insights analysis', { url: input.url, strategy: input.strategy });

    const apiKey = getApiKey();
    const baseUrl = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

    const params: Record<string, string> = {
      url: input.url,
      strategy: input.strategy,
    };

    if (apiKey) {
      params.key = apiKey;
    }

    if (input.categories) {
      input.categories.forEach((cat) => {
        params[`category`] = cat;
      });
    }

    if (input.locale) {
      params.locale = input.locale;
    }

    // Build URL with multiple category params
    let requestUrl = `${baseUrl}?url=${encodeURIComponent(input.url)}&strategy=${input.strategy}`;
    if (apiKey) {
      requestUrl += `&key=${apiKey}`;
    }
    if (input.categories) {
      input.categories.forEach(cat => {
        requestUrl += `&category=${cat}`;
      });
    }
    if (input.locale) {
      requestUrl += `&locale=${input.locale}`;
    }

    const response = await axios.get(requestUrl, { timeout: 120000 });
    const data = response.data;

    const result: PSIAnalyzeOutput = {
      lighthouseResult: {
        finalUrl: data.lighthouseResult?.finalUrl || input.url,
        requestedUrl: data.lighthouseResult?.requestedUrl || input.url,
        fetchTime: data.lighthouseResult?.fetchTime || new Date().toISOString(),
        categories: {},
        audits: {},
      },
    };

    // Extract categories
    if (data.lighthouseResult?.categories) {
      const cats = data.lighthouseResult.categories;
      if (cats.performance) result.lighthouseResult.categories.performance = { score: cats.performance.score };
      if (cats.accessibility) result.lighthouseResult.categories.accessibility = { score: cats.accessibility.score };
      if (cats['best-practices']) result.lighthouseResult.categories['best-practices'] = { score: cats['best-practices'].score };
      if (cats.seo) result.lighthouseResult.categories.seo = { score: cats.seo.score };
      if (cats.pwa) result.lighthouseResult.categories.pwa = { score: cats.pwa.score };
    }

    // Extract key audits
    if (data.lighthouseResult?.audits) {
      const keyAudits = [
        'first-contentful-paint',
        'largest-contentful-paint',
        'total-blocking-time',
        'cumulative-layout-shift',
        'speed-index',
        'interactive',
        'server-response-time',
        'render-blocking-resources',
        'uses-optimized-images',
        'uses-text-compression',
      ];

      for (const auditId of keyAudits) {
        const audit = data.lighthouseResult.audits[auditId];
        if (audit) {
          result.lighthouseResult.audits[auditId] = {
            id: audit.id,
            title: audit.title,
            description: audit.description,
            score: audit.score,
            scoreDisplayMode: audit.scoreDisplayMode,
            displayValue: audit.displayValue,
          };
        }
      }
    }

    // Extract loading experience
    if (data.loadingExperience) {
      result.loadingExperience = {
        metrics: data.loadingExperience.metrics || {},
        overall_category: data.loadingExperience.overall_category || 'AVERAGE',
      };
    }

    // Extract origin loading experience
    if (data.originLoadingExperience) {
      result.originLoadingExperience = {
        metrics: data.originLoadingExperience.metrics || {},
        overall_category: data.originLoadingExperience.overall_category || 'AVERAGE',
      };
    }

    log.info('PageSpeed analysis completed', {
      url: input.url,
      performanceScore: result.lighthouseResult.categories.performance?.score,
    });

    return result;
  },
};
