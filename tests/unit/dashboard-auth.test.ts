/**
 * Tests for dashboard authentication middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IncomingMessage } from 'node:http';

const { authenticateRequest } = await import('../../src/dashboard/auth.js');

/** Create a minimal mock IncomingMessage */
function mockReq(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe('authenticateRequest', () => {
  beforeEach(() => {
    // Reset env
    delete process.env.DASHBOARD_API_KEY;
    delete process.env.DASHBOARD_AUTH_REQUIRED;
  });

  describe('dev mode (no key, auth not required)', () => {
    it('should allow all requests', () => {
      process.env.DASHBOARD_AUTH_REQUIRED = 'false';
      const result = authenticateRequest(mockReq());
      expect(result.authenticated).toBe(true);
    });
  });

  describe('auth required but no key configured', () => {
    it('should block all requests', () => {
      process.env.DASHBOARD_AUTH_REQUIRED = 'true';
      const result = authenticateRequest(mockReq());
      expect(result.authenticated).toBe(false);
      expect(result.reason).toContain('not configured');
    });

    it('should block by default (no env set)', () => {
      const result = authenticateRequest(mockReq());
      expect(result.authenticated).toBe(false);
    });
  });

  describe('with API key configured', () => {
    beforeEach(() => {
      process.env.DASHBOARD_API_KEY = 'test-secret-key';
    });

    it('should accept valid Bearer token', () => {
      const result = authenticateRequest(
        mockReq({ authorization: 'Bearer test-secret-key' }),
      );
      expect(result.authenticated).toBe(true);
    });

    it('should accept valid X-API-Key header', () => {
      const result = authenticateRequest(
        mockReq({ 'x-api-key': 'test-secret-key' }),
      );
      expect(result.authenticated).toBe(true);
    });

    it('should reject invalid Bearer token', () => {
      const result = authenticateRequest(
        mockReq({ authorization: 'Bearer wrong-key' }),
      );
      expect(result.authenticated).toBe(false);
    });

    it('should reject invalid X-API-Key', () => {
      const result = authenticateRequest(
        mockReq({ 'x-api-key': 'wrong-key' }),
      );
      expect(result.authenticated).toBe(false);
    });

    it('should reject request with no auth headers', () => {
      const result = authenticateRequest(mockReq());
      expect(result.authenticated).toBe(false);
    });

    it('should be case-insensitive on Bearer prefix', () => {
      const result = authenticateRequest(
        mockReq({ authorization: 'bearer test-secret-key' }),
      );
      expect(result.authenticated).toBe(true);
    });
  });
});
