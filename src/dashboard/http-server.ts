/**
 * Dashboard HTTP server using node:http
 *
 * Runs alongside the MCP stdio transport to serve the web dashboard and REST API.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { createServiceLogger } from '../utils/logger.js';
import { handleApiRoute } from './routes/api.js';
import { handleSseRoute } from './routes/sse.js';
import { handleSettingsRoute } from './routes/settings.js';
import { getDashboardHtml } from './ui/assets.js';

const log = createServiceLogger('dashboard-http');

/** Get allowed CORS origin based on configuration */
function getCorsOrigin(req: IncomingMessage): string {
  // In dev mode (no auth required), allow any origin for convenience
  if (process.env.DASHBOARD_AUTH_REQUIRED === 'false' && !process.env.DASHBOARD_API_KEY) {
    return '*';
  }
  // In production, restrict to same-origin (the request's own origin or none)
  const origin = req.headers.origin;
  if (origin) {
    // Allow localhost origins (dashboard is accessed locally)
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return origin;
      }
    } catch {
      // Invalid origin
    }
  }
  // No CORS header = same-origin only
  return '';
}

/**
 * Create the dashboard HTTP server
 */
export function createDashboardServer(): Server {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // CORS headers
    const corsOrigin = getCorsOrigin(req);
    if (corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      if (corsOrigin !== '*') {
        res.setHeader('Vary', 'Origin');
      }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    log.debug(`${req.method} ${pathname}`);

    try {
      // SSE route (before other API routes since it's long-lived)
      if (pathname === '/api/sse') {
        const handled = handleSseRoute(req, res, pathname);
        if (handled) return;
      }

      // Settings routes
      if (pathname.startsWith('/api/settings/')) {
        const handled = await handleSettingsRoute(req, res, pathname);
        if (handled) return;
      }

      // API routes
      if (pathname.startsWith('/api/')) {
        const handled = await handleApiRoute(req, res, pathname);
        if (handled) return;
      }

      // Dashboard HTML (no auth for the shell)
      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(getDashboardHtml());
        return;
      }

      // Favicon (prevent 404 noise)
      if (pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      log.error('Request error', { error: error instanceof Error ? error : new Error(String(error)) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  return server;
}
