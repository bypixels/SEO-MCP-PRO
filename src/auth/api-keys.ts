/**
 * API Key management for Google APIs that use API keys
 * (PageSpeed Insights, Safe Browsing, etc.)
 */

import { MCPError, ErrorCode } from '../types/errors.js';
import { createServiceLogger } from '../utils/logger.js';

const log = createServiceLogger('api-keys');

export interface ApiKeyConfig {
  pagespeed?: string;
  safeBrowsing?: string;
}

/**
 * API Key manager
 */
export class ApiKeyManager {
  private keys: ApiKeyConfig = {};

  constructor(config?: ApiKeyConfig) {
    if (config) {
      this.keys = { ...config };
    }
    this.loadFromEnv();
  }

  /**
   * Load API keys from environment variables
   */
  private loadFromEnv(): void {
    if (process.env.GOOGLE_PAGESPEED_API_KEY) {
      this.keys.pagespeed = process.env.GOOGLE_PAGESPEED_API_KEY;
    }

    if (process.env.GOOGLE_SAFE_BROWSING_API_KEY) {
      this.keys.safeBrowsing = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
    }

    const configuredKeys = Object.entries(this.keys)
      .filter(([_, v]) => !!v)
      .map(([k]) => k);

    if (configuredKeys.length > 0) {
      log.info('API keys loaded', { keys: configuredKeys });
    }
  }

  /**
   * Get API key for a service
   */
  getKey(service: keyof ApiKeyConfig): string | undefined {
    return this.keys[service];
  }

  /**
   * Get API key or throw if not configured
   */
  requireKey(service: keyof ApiKeyConfig): string {
    const key = this.keys[service];

    if (!key) {
      throw new MCPError({
        code: ErrorCode.AUTH_NOT_CONFIGURED,
        message: `API key not configured for ${service}. Set GOOGLE_${service.toUpperCase()}_API_KEY environment variable.`,
        retryable: false,
      });
    }

    return key;
  }

  /**
   * Set an API key
   */
  setKey(service: keyof ApiKeyConfig, key: string): void {
    this.keys[service] = key;
    log.info(`API key set for ${service}`);
  }

  /**
   * Remove an API key
   */
  removeKey(service: keyof ApiKeyConfig): void {
    delete this.keys[service];
    log.info(`API key removed for ${service}`);
  }

  /**
   * Clear all API keys
   */
  clear(): void {
    this.keys = {};
    log.info('All API keys cleared');
  }

  /**
   * Check if a key is configured
   */
  hasKey(service: keyof ApiKeyConfig): boolean {
    return !!this.keys[service];
  }

  /**
   * Get status of all keys
   */
  getStatus(): Record<keyof ApiKeyConfig, boolean> {
    return {
      pagespeed: !!this.keys.pagespeed,
      safeBrowsing: !!this.keys.safeBrowsing,
    };
  }
}

/** Singleton instance */
export const apiKeyManager = new ApiKeyManager();

export default apiKeyManager;
