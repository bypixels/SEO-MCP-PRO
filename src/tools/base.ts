/**
 * Base tool utilities and helpers
 */

import { z } from 'zod';
import axios, { AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import { ToolDefinition, ToolOutput, successOutput, errorOutput } from '../types/tools.js';
import { MCPError } from '../types/errors.js';
import { logToolExecution } from '../utils/logger.js';
import { withCache, buildCacheKey } from '../utils/cache.js';
import { isValidUrl, normalizeUrl } from '../utils/validators.js';
import { DEFAULT_TIMEOUTS, USER_AGENT } from '../config/defaults.js';

/**
 * HTTP client with default configuration
 */
export const httpClient = axios.create({
  timeout: DEFAULT_TIMEOUTS.api,
  headers: {
    'User-Agent': USER_AGENT,
  },
  validateStatus: () => true, // Don't throw on any status
});

/**
 * Fetch URL content with error handling
 */
export async function fetchUrl(
  url: string,
  options: AxiosRequestConfig = {}
): Promise<{
  status: number;
  headers: Record<string, string>;
  data: string;
  responseTime: number;
}> {
  const normalizedUrl = normalizeUrl(url);
  const start = Date.now();

  try {
    const response = await httpClient.get(normalizedUrl, {
      ...options,
      responseType: 'text',
    });

    const responseTime = Date.now() - start;

    // Normalize headers to lowercase keys
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (typeof value === 'string') {
        headers[key.toLowerCase()] = value;
      } else if (Array.isArray(value)) {
        headers[key.toLowerCase()] = value.join(', ');
      }
    }

    return {
      status: response.status,
      headers,
      data: response.data,
      responseTime,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw MCPError.externalServiceError(url, 'Request timeout');
      }
      if (error.code === 'ENOTFOUND') {
        throw MCPError.externalServiceError(url, 'Domain not found');
      }
      throw MCPError.externalServiceError(
        url,
        error.message || 'Request failed'
      );
    }
    throw error;
  }
}

/**
 * Fetch and parse HTML
 */
export async function fetchHtml(url: string): Promise<{
  $: cheerio.CheerioAPI;
  status: number;
  headers: Record<string, string>;
  responseTime: number;
}> {
  const result = await fetchUrl(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  const $ = cheerio.load(result.data);

  return {
    $,
    status: result.status,
    headers: result.headers,
    responseTime: result.responseTime,
  };
}

/**
 * Validate URL input
 */
export function validateUrlInput(url: unknown): string {
  if (typeof url !== 'string' || !url) {
    throw MCPError.validationError('URL is required');
  }

  if (!isValidUrl(url) && !isValidUrl(`https://${url}`)) {
    throw MCPError.validationError(`Invalid URL: ${url}`);
  }

  return normalizeUrl(url);
}

/**
 * Common input schemas
 */
export const CommonSchemas = {
  urlInput: z.object({
    url: z.string().describe('URL to analyze'),
  }),

  urlsInput: z.object({
    urls: z.array(z.string()).min(1).max(100).describe('URLs to analyze'),
  }),

  domainInput: z.object({
    domain: z.string().describe('Domain name'),
  }),
};

/**
 * Create a tool definition helper
 */
export function defineTool<TInput, TOutput>(
  config: Omit<ToolDefinition<TInput, TOutput>, 'handler'> & {
    handler: (input: TInput) => Promise<TOutput>;
    cacheTTL?: number;
    cacheKeyFn?: (input: TInput) => string;
  }
): ToolDefinition<TInput, TOutput> {
  const { cacheTTL, cacheKeyFn, handler, ...rest } = config;

  const wrappedHandler = async (input: TInput): Promise<TOutput> => {
    return logToolExecution(config.name, config.category, async () => {
      // If caching is configured
      if (cacheTTL !== undefined && cacheKeyFn) {
        const cacheKey = buildCacheKey([config.name, cacheKeyFn(input)]);
        const { data } = await withCache(cacheKey, () => handler(input), {
          ttl: cacheTTL,
        });
        return data;
      }

      return handler(input);
    });
  };

  return {
    ...rest,
    handler: wrappedHandler,
  };
}

/**
 * Format tool result for MCP response
 */
export function formatToolResult<T>(result: ToolOutput<T>): {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
} {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: !result.success,
  };
}

export { successOutput, errorOutput };
