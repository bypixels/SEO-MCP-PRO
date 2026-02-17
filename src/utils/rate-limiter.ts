/**
 * Rate limiter utility using Bottleneck
 */

import Bottleneck from 'bottleneck';
import { RATE_LIMITS, ServiceName } from '../types/config.js';
import { MCPError, ErrorCode } from '../types/errors.js';
import { createServiceLogger } from './logger.js';

const log = createServiceLogger('rate-limiter');

interface LimiterInfo {
  limiter: Bottleneck;
  config: { requests: number; window: number };
}

/**
 * Rate limiter manager for all services
 */
class RateLimiterManager {
  private limiters: Map<string, LimiterInfo> = new Map();
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.RATE_LIMIT_ENABLED !== 'false';
    this.initializeLimiters();
  }

  /**
   * Initialize limiters for all configured services
   */
  private initializeLimiters(): void {
    for (const [service, config] of Object.entries(RATE_LIMITS)) {
      this.createLimiter(service, config);
    }
    log.info(`Rate limiters initialized for ${this.limiters.size} services`, {
      enabled: this.enabled,
    });
  }

  /**
   * Create a limiter for a service
   */
  private createLimiter(
    service: string,
    config: { requests: number; window: number }
  ): void {
    // Bottleneck uses reservoir for rate limiting
    // reservoir = max requests, reservoirRefreshInterval = window in ms
    const limiter = new Bottleneck({
      reservoir: config.requests,
      reservoirRefreshAmount: config.requests,
      reservoirRefreshInterval: config.window,
      // Max concurrent to avoid overwhelming services
      maxConcurrent: Math.min(config.requests, 10),
      // Min time between requests (spread them out)
      minTime: Math.max(100, Math.floor(config.window / config.requests)),
    });

    // Log when reservoir is depleted
    limiter.on('depleted', () => {
      log.warn(`Rate limit depleted for ${service}`);
    });

    this.limiters.set(service, { limiter, config });
  }

  /**
   * Get limiter for a service
   */
  private getLimiter(service: string): LimiterInfo | undefined {
    return this.limiters.get(service);
  }

  /**
   * Check if a request is allowed (without consuming)
   */
  async checkLimit(service: ServiceName): Promise<{
    allowed: boolean;
    remaining?: number;
    retryAfter?: number;
  }> {
    if (!this.enabled) {
      return { allowed: true };
    }

    const info = this.getLimiter(service);
    if (!info) {
      // No limiter configured, allow the request
      return { allowed: true };
    }

    const counts = await info.limiter.currentReservoir();

    if (counts === null || counts > 0) {
      return {
        allowed: true,
        remaining: counts ?? undefined,
      };
    }

    // Calculate retry after based on window
    const retryAfter = Math.ceil(info.config.window / 1000);

    return {
      allowed: false,
      remaining: 0,
      retryAfter,
    };
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(
    service: ServiceName,
    fn: () => Promise<T>,
    options: { priority?: number; weight?: number } = {}
  ): Promise<T> {
    if (!this.enabled) {
      return fn();
    }

    const info = this.getLimiter(service);
    if (!info) {
      // No limiter configured, execute directly
      return fn();
    }

    try {
      return await info.limiter.schedule(
        { priority: options.priority ?? 5, weight: options.weight ?? 1 },
        fn
      );
    } catch (error) {
      if (error instanceof Bottleneck.BottleneckError) {
        const retryAfter = Math.ceil(info.config.window / 1000);
        throw MCPError.rateLimitError(service, retryAfter);
      }
      throw error;
    }
  }

  /**
   * Get current usage for a service
   */
  async getUsage(service: ServiceName): Promise<{
    used: number;
    limit: number;
    remaining: number;
    resetIn: number;
  }> {
    const info = this.getLimiter(service);
    if (!info) {
      return { used: 0, limit: Infinity, remaining: Infinity, resetIn: 0 };
    }

    const reservoir = await info.limiter.currentReservoir();
    const remaining = reservoir ?? info.config.requests;
    const used = info.config.requests - remaining;

    return {
      used,
      limit: info.config.requests,
      remaining,
      resetIn: Math.ceil(info.config.window / 1000),
    };
  }

  /**
   * Get status of all limiters
   */
  async getAllStatus(): Promise<
    Record<string, { used: number; limit: number; remaining: number }>
  > {
    const status: Record<string, { used: number; limit: number; remaining: number }> = {};

    for (const [service] of this.limiters) {
      const usage = await this.getUsage(service as ServiceName);
      status[service] = {
        used: usage.used,
        limit: usage.limit,
        remaining: usage.remaining,
      };
    }

    return status;
  }

  /**
   * Reset limiter for a service (useful for testing)
   */
  async reset(service: ServiceName): Promise<void> {
    const info = this.getLimiter(service);
    if (info) {
      await info.limiter.updateSettings({
        reservoir: info.config.requests,
      });
      log.info(`Rate limiter reset for ${service}`);
    }
  }

  /**
   * Enable or disable rate limiting
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log.info(`Rate limiting ${enabled ? 'enabled' : 'disabled'}`);
  }
}

/** Global rate limiter instance */
export const rateLimiter = new RateLimiterManager();

/**
 * Decorator-style wrapper for rate-limited functions
 */
export function withRateLimit<T>(
  service: ServiceName,
  fn: () => Promise<T>
): Promise<T> {
  return rateLimiter.execute(service, fn);
}

/**
 * Check rate limit before executing
 * Throws MCPError if limit exceeded
 */
export async function checkRateLimit(service: ServiceName): Promise<void> {
  const status = await rateLimiter.checkLimit(service);

  if (!status.allowed) {
    throw new MCPError({
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      message: `Rate limit exceeded for ${service}. Try again in ${status.retryAfter} seconds.`,
      retryable: true,
      retryAfter: status.retryAfter,
      service,
    });
  }
}

export default rateLimiter;
