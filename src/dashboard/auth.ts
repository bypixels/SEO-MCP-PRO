/**
 * Dashboard API authentication middleware
 */

import type { IncomingMessage } from 'node:http';

export interface AuthResult {
  authenticated: boolean;
  reason?: string;
}

/**
 * Check if a request is authenticated.
 *
 * Auth modes:
 * - If DASHBOARD_API_KEY is set: requires Bearer token or X-API-Key header
 * - If DASHBOARD_AUTH_REQUIRED=false and no API key: allows all (dev mode)
 */
export function authenticateRequest(req: IncomingMessage): AuthResult {
  const apiKey = process.env.DASHBOARD_API_KEY;
  const authRequired = process.env.DASHBOARD_AUTH_REQUIRED !== 'false';

  // Dev mode: no key configured and auth not required
  if (!apiKey && !authRequired) {
    return { authenticated: true };
  }

  // Auth required but no key configured — block everything
  if (!apiKey && authRequired) {
    return { authenticated: false, reason: 'DASHBOARD_API_KEY not configured' };
  }

  // Check Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1] === apiKey) {
      return { authenticated: true };
    }
  }

  // Check X-API-Key header
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey === apiKey) {
    return { authenticated: true };
  }

  return { authenticated: false, reason: 'Invalid or missing API key' };
}
