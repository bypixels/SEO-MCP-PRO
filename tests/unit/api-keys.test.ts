/**
 * Tests for the API key manager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Clear env before import so ApiKeyManager doesn't pick up real keys
vi.stubEnv('GOOGLE_PAGESPEED_API_KEY', '');
vi.stubEnv('GOOGLE_SAFE_BROWSING_API_KEY', '');

const { ApiKeyManager } = await import('../../src/auth/api-keys.js');

describe('ApiKeyManager', () => {
  let manager: InstanceType<typeof ApiKeyManager>;

  beforeEach(() => {
    manager = new ApiKeyManager();
  });

  it('should start with no keys', () => {
    const status = manager.getStatus();
    expect(status.pagespeed).toBe(false);
    expect(status.safeBrowsing).toBe(false);
  });

  it('should set and get a key', () => {
    manager.setKey('pagespeed', 'test-key');
    expect(manager.getKey('pagespeed')).toBe('test-key');
    expect(manager.hasKey('pagespeed')).toBe(true);
  });

  it('should remove a key', () => {
    manager.setKey('pagespeed', 'test-key');
    manager.removeKey('pagespeed');
    expect(manager.getKey('pagespeed')).toBeUndefined();
    expect(manager.hasKey('pagespeed')).toBe(false);
  });

  it('should clear all keys', () => {
    manager.setKey('pagespeed', 'key1');
    manager.setKey('safeBrowsing', 'key2');
    manager.clear();

    expect(manager.hasKey('pagespeed')).toBe(false);
    expect(manager.hasKey('safeBrowsing')).toBe(false);
  });

  it('should initialize from config', () => {
    const m = new ApiKeyManager({ pagespeed: 'config-key' });
    expect(m.getKey('pagespeed')).toBe('config-key');
  });

  it('should throw on requireKey when key missing', () => {
    expect(() => manager.requireKey('pagespeed')).toThrow();
  });

  it('should return key on requireKey when key present', () => {
    manager.setKey('pagespeed', 'my-key');
    expect(manager.requireKey('pagespeed')).toBe('my-key');
  });

  it('should reflect correct status', () => {
    manager.setKey('pagespeed', 'key1');
    const status = manager.getStatus();
    expect(status.pagespeed).toBe(true);
    expect(status.safeBrowsing).toBe(false);
  });
});
