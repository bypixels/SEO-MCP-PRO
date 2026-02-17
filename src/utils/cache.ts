/**
 * Cache utility with in-memory and optional file-based caching
 */

import { createServiceLogger } from './logger.js';
import { CACHE_TTL } from '../types/config.js';

const log = createServiceLogger('cache');

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

interface CacheOptions {
  /** TTL in seconds */
  ttl?: number;
  /** Cache key prefix */
  prefix?: string;
}

/**
 * In-memory cache implementation
 */
class MemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private maxItems: number;
  private defaultTTL: number;

  constructor(maxItems = 1000, defaultTTL = 300) {
    this.maxItems = maxItems;
    this.defaultTTL = defaultTTL;
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      log.debug(`Cache expired: ${key}`);
      return undefined;
    }

    log.debug(`Cache hit: ${key}`);
    return entry.data;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, data: T, ttlSeconds?: number): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxItems) {
      this.evictOldest();
    }

    const ttl = ttlSeconds ?? this.defaultTTL;
    const now = Date.now();

    this.cache.set(key, {
      data,
      createdAt: now,
      expiresAt: now + ttl * 1000,
    });

    log.debug(`Cache set: ${key}`, { ttl });
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    log.info('Cache cleared');
  }

  /**
   * Clear expired entries
   */
  clearExpired(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      log.debug(`Cleared ${cleared} expired cache entries`);
    }

    return cleared;
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; maxItems: number } {
    return {
      size: this.cache.size,
      maxItems: this.maxItems,
    };
  }

  /**
   * Evict oldest entries to make room (removes 10% of capacity)
   */
  private evictOldest(): void {
    const evictCount = Math.max(1, Math.ceil(this.maxItems * 0.1));
    const entries: { key: string; createdAt: number }[] = [];

    for (const [key, entry] of this.cache.entries()) {
      entries.push({ key, createdAt: entry.createdAt });
    }

    entries.sort((a, b) => a.createdAt - b.createdAt);

    const toEvict = entries.slice(0, evictCount);
    for (const { key } of toEvict) {
      this.cache.delete(key);
    }

    if (toEvict.length > 0) {
      log.debug(`Cache evicted ${toEvict.length} entries`);
    }
  }
}

/** Global cache instance */
const memoryCache = new MemoryCache(
  parseInt(process.env.CACHE_MAX_ITEMS || '1000', 10),
  parseInt(process.env.CACHE_TTL || '300', 10)
);

/**
 * Build cache key from parts
 */
export function buildCacheKey(parts: (string | number | undefined)[]): string {
  return parts.filter(Boolean).join(':');
}

/**
 * Get from cache
 */
export function cacheGet<T>(key: string): T | undefined {
  return memoryCache.get<T>(key);
}

/**
 * Set in cache
 */
export function cacheSet<T>(key: string, data: T, ttlSeconds?: number): void {
  memoryCache.set(key, data, ttlSeconds);
}

/**
 * Delete from cache
 */
export function cacheDelete(key: string): boolean {
  return memoryCache.delete(key);
}

/**
 * Clear all cache
 */
export function cacheClear(): void {
  memoryCache.clear();
}

/**
 * Get cache stats
 */
export function cacheStats() {
  return memoryCache.stats();
}

/**
 * Wrapper for caching async function results
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<{ data: T; cached: boolean; cachedAt?: string }> {
  const fullKey = options.prefix ? `${options.prefix}:${key}` : key;

  // Try to get from cache
  const cached = cacheGet<{ data: T; cachedAt: string }>(fullKey);
  if (cached) {
    return {
      data: cached.data,
      cached: true,
      cachedAt: cached.cachedAt,
    };
  }

  // Execute function and cache result
  const data = await fn();
  const cachedAt = new Date().toISOString();

  cacheSet(
    fullKey,
    { data, cachedAt },
    options.ttl ?? CACHE_TTL.performance
  );

  return { data, cached: false };
}

/**
 * Get appropriate TTL for a data type
 */
export function getTTLForDataType(
  type: keyof typeof CACHE_TTL
): number {
  return CACHE_TTL[type];
}

// Periodically clear expired entries (every 5 minutes)
setInterval(() => {
  memoryCache.clearExpired();
}, 5 * 60 * 1000);

export default memoryCache;
