/**
 * Default configuration values
 */

import { ServerConfig } from '../types/config.js';

/** Default server configuration */
export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  logLevel: 'info',
  cache: {
    ttl: 300, // 5 minutes
    maxItems: 1000,
    directory: '.cache',
  },
  rateLimit: {
    enabled: true,
  },
};

/** Date range preset type */
interface DateRangePreset {
  startDate: string | (() => string);
  endDate: string | (() => string);
}

/** Default date range presets */
export const DATE_RANGE_PRESETS: Record<string, DateRangePreset> = {
  '7d': {
    startDate: '7daysAgo',
    endDate: 'today',
  },
  '30d': {
    startDate: '30daysAgo',
    endDate: 'today',
  },
  '90d': {
    startDate: '90daysAgo',
    endDate: 'today',
  },
  ytd: {
    startDate: () => {
      const now = new Date();
      return `${now.getFullYear()}-01-01`;
    },
    endDate: 'today',
  },
};

/** Default pagination settings */
export const DEFAULT_PAGINATION = {
  pageSize: 100,
  maxPageSize: 200,
};

/** Default timeouts (in milliseconds) */
export const DEFAULT_TIMEOUTS = {
  api: 30000, // 30 seconds
  lighthouse: 60000, // 60 seconds
  screenshot: 30000, // 30 seconds
  ssl: 300000, // 5 minutes (SSL Labs can be slow)
};

/** User agent for HTTP requests */
export const USER_AGENT = 'WebsiteOpsMCP/1.0';

/** Dashboard defaults */
export const DASHBOARD_DEFAULTS = {
  port: 3737,
  enabled: false,
  authRequired: true,
};

/** Get resolved date range from preset */
export function resolveDateRangePreset(
  preset: keyof typeof DATE_RANGE_PRESETS
): { startDate: string; endDate: string } {
  const config = DATE_RANGE_PRESETS[preset];

  return {
    startDate:
      typeof config.startDate === 'function'
        ? config.startDate()
        : config.startDate,
    endDate:
      typeof config.endDate === 'function' ? config.endDate() : config.endDate,
  };
}

/** Get config from environment with defaults */
export function getServerConfig(): ServerConfig {
  return {
    logLevel: (process.env.LOG_LEVEL as ServerConfig['logLevel']) || 'info',
    cache: {
      ttl: parseInt(process.env.CACHE_TTL || '300', 10),
      maxItems: parseInt(process.env.CACHE_MAX_ITEMS || '1000', 10),
      directory: process.env.CACHE_DIRECTORY || '.cache',
    },
    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    },
  };
}
