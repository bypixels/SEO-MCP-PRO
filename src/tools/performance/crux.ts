/**
 * Chrome UX Report (CrUX) tools
 */

import { z } from 'zod';
import axios from 'axios';
import { createServiceLogger } from '../../utils/logger.js';
import { MCPError, ErrorCode } from '../../types/errors.js';
import type { ToolDefinition } from '../../types/tools.js';
import { ToolCategory } from '../../types/tools.js';

const log = createServiceLogger('crux');

// Get API key from environment
function getApiKey(): string | undefined {
  return process.env.GOOGLE_PAGESPEED_API_KEY; // CrUX uses same API key
}

// ============================================
// CrUX Query
// ============================================

const cruxQuerySchema = z.object({
  url: z.string().optional().describe('Specific URL to query'),
  origin: z.string().optional().describe('Origin-level data (e.g., https://example.com)'),
  formFactor: z.enum(['PHONE', 'DESKTOP', 'TABLET']).optional().describe('Device form factor'),
  metrics: z.array(z.enum([
    'cumulative_layout_shift',
    'first_contentful_paint',
    'first_input_delay',
    'interaction_to_next_paint',
    'largest_contentful_paint',
    'experimental_time_to_first_byte',
  ])).optional().describe('Metrics to retrieve'),
});

type CrUXQueryInput = z.infer<typeof cruxQuerySchema>;

interface CrUXMetric {
  histogram: { start: number; end: number; density: number }[];
  percentiles: { p75: number };
}

interface CrUXQueryOutput {
  record: {
    key: {
      url?: string;
      origin?: string;
      formFactor?: string;
    };
    metrics: Record<string, CrUXMetric>;
    collectionPeriod: {
      firstDate: { year: number; month: number; day: number };
      lastDate: { year: number; month: number; day: number };
    };
  };
}

export const cruxQueryTool: ToolDefinition<CrUXQueryInput, CrUXQueryOutput> = {
  name: 'crux_query',
  description: 'Queries Chrome UX Report data for real-world performance metrics',
  category: ToolCategory.PERFORMANCE,
  inputSchema: cruxQuerySchema,

  async handler(input: CrUXQueryInput): Promise<CrUXQueryOutput> {
    if (!input.url && !input.origin) {
      throw new MCPError({
        code: ErrorCode.INVALID_PARAMS,
        message: 'Either url or origin must be provided',
        retryable: false,
      });
    }

    log.info('Querying CrUX data', { url: input.url, origin: input.origin });

    const apiKey = getApiKey();
    if (!apiKey) {
      throw new MCPError({
        code: ErrorCode.AUTH_NOT_CONFIGURED,
        message: 'GOOGLE_PAGESPEED_API_KEY is required for CrUX API',
        retryable: false,
        service: 'pagespeed',
      });
    }

    const requestBody: Record<string, unknown> = {};

    if (input.url) {
      requestBody.url = input.url;
    } else if (input.origin) {
      requestBody.origin = input.origin;
    }

    if (input.formFactor) {
      requestBody.formFactor = input.formFactor;
    }

    if (input.metrics && input.metrics.length > 0) {
      requestBody.metrics = input.metrics;
    }

    const response = await axios.post(
      `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${apiKey}`,
      requestBody,
      { timeout: 30000 }
    );

    const data = response.data;

    const result: CrUXQueryOutput = {
      record: {
        key: data.record?.key || {},
        metrics: data.record?.metrics || {},
        collectionPeriod: data.record?.collectionPeriod || {
          firstDate: { year: 0, month: 0, day: 0 },
          lastDate: { year: 0, month: 0, day: 0 },
        },
      },
    };

    log.info('CrUX query completed', {
      url: input.url || input.origin,
      metricsCount: Object.keys(result.record.metrics).length,
    });

    return result;
  },
};

// ============================================
// CrUX History
// ============================================

const cruxHistorySchema = z.object({
  url: z.string().optional().describe('Specific URL to query'),
  origin: z.string().optional().describe('Origin-level data'),
  formFactor: z.enum(['PHONE', 'DESKTOP', 'TABLET']).optional().describe('Device form factor'),
  metrics: z.array(z.string()).optional().describe('Metrics to retrieve'),
});

type CrUXHistoryInput = z.infer<typeof cruxHistorySchema>;

interface CrUXHistoryOutput {
  record: {
    key: { url?: string; origin?: string; formFactor?: string };
    collectionPeriods: {
      firstDate: { year: number; month: number; day: number };
      lastDate: { year: number; month: number; day: number };
    }[];
    metrics: Record<string, {
      histogramTimeseries: {
        start: number;
        end: number;
        densities: number[];
      }[];
      percentilesTimeseries: {
        p75s: number[];
      };
    }>;
  };
}

export const cruxHistoryTool: ToolDefinition<CrUXHistoryInput, CrUXHistoryOutput> = {
  name: 'crux_history',
  description: 'Gets historical Chrome UX Report data for trend analysis',
  category: ToolCategory.PERFORMANCE,
  inputSchema: cruxHistorySchema,

  async handler(input: CrUXHistoryInput): Promise<CrUXHistoryOutput> {
    if (!input.url && !input.origin) {
      throw new MCPError({
        code: ErrorCode.INVALID_PARAMS,
        message: 'Either url or origin must be provided',
        retryable: false,
      });
    }

    log.info('Querying CrUX history', { url: input.url, origin: input.origin });

    const apiKey = getApiKey();
    if (!apiKey) {
      throw new MCPError({
        code: ErrorCode.AUTH_NOT_CONFIGURED,
        message: 'GOOGLE_PAGESPEED_API_KEY is required for CrUX API',
        retryable: false,
        service: 'pagespeed',
      });
    }

    const requestBody: Record<string, unknown> = {};

    if (input.url) {
      requestBody.url = input.url;
    } else if (input.origin) {
      requestBody.origin = input.origin;
    }

    if (input.formFactor) {
      requestBody.formFactor = input.formFactor;
    }

    if (input.metrics && input.metrics.length > 0) {
      requestBody.metrics = input.metrics;
    }

    const response = await axios.post(
      `https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord?key=${apiKey}`,
      requestBody,
      { timeout: 30000 }
    );

    const data = response.data;

    const result: CrUXHistoryOutput = {
      record: {
        key: data.record?.key || {},
        collectionPeriods: data.record?.collectionPeriods || [],
        metrics: data.record?.metrics || {},
      },
    };

    log.info('CrUX history query completed', {
      url: input.url || input.origin,
      periodsCount: result.record.collectionPeriods.length,
    });

    return result;
  },
};
