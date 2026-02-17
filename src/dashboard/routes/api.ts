/**
 * Dashboard REST API route handlers
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticateRequest } from '../auth.js';
import {
  getDashboardData,
  getReportData,
  executeToolByName,
  listTools,
} from '../services/dashboard-data.js';
import { authManager } from '../../auth/index.js';
import { cacheStats } from '../../utils/cache.js';
import { rateLimiter } from '../../utils/rate-limiter.js';
import { MCPError } from '../../types/errors.js';

/** Send JSON response */
function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify(data));
}

/** Send error response */
function sendError(res: ServerResponse, message: string, status = 500): void {
  sendJson(res, { error: message }, status);
}

/** Parse URL search params */
function getParams(req: IncomingMessage): URLSearchParams {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  return url.searchParams;
}

const MAX_BODY_SIZE = 1024 * 100; // 100 KB

/** Parse JSON body from POST request */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Route API requests. Returns true if handled, false if not matched.
 */
export async function handleApiRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  // All API routes require auth
  const auth = authenticateRequest(req);
  if (!auth.authenticated) {
    sendError(res, auth.reason || 'Unauthorized', 401);
    return true;
  }

  // GET /api/health
  if (pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, {
      status: 'ok',
      uptime: process.uptime(),
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // GET /api/tools
  if (pathname === '/api/tools' && req.method === 'GET') {
    sendJson(res, { tools: listTools() });
    return true;
  }

  // GET /api/dashboard?url=X
  if (pathname === '/api/dashboard' && req.method === 'GET') {
    const url = getParams(req).get('url');
    if (!url) {
      sendError(res, 'Missing url parameter', 400);
      return true;
    }
    try {
      const data = await getDashboardData(url);
      sendJson(res, data);
    } catch (error) {
      const msg = error instanceof MCPError ? error.message : String(error);
      sendError(res, msg, error instanceof MCPError ? 400 : 500);
    }
    return true;
  }

  // GET /api/report/site-health?url=X
  if (pathname === '/api/report/site-health' && req.method === 'GET') {
    const url = getParams(req).get('url');
    if (!url) {
      sendError(res, 'Missing url parameter', 400);
      return true;
    }
    try {
      const data = await getReportData('site-health', { url });
      sendJson(res, data);
    } catch (error) {
      const msg = error instanceof MCPError ? error.message : String(error);
      sendError(res, msg, error instanceof MCPError ? 400 : 500);
    }
    return true;
  }

  // GET /api/report/seo-audit?url=X
  if (pathname === '/api/report/seo-audit' && req.method === 'GET') {
    const url = getParams(req).get('url');
    if (!url) {
      sendError(res, 'Missing url parameter', 400);
      return true;
    }
    try {
      const data = await getReportData('seo-audit', { url });
      sendJson(res, data);
    } catch (error) {
      const msg = error instanceof MCPError ? error.message : String(error);
      sendError(res, msg, error instanceof MCPError ? 400 : 500);
    }
    return true;
  }

  // POST /api/tool/:name
  const toolMatch = pathname.match(/^\/api\/tool\/([a-z0-9_-]+)$/);
  if (toolMatch && req.method === 'POST') {
    const toolName = toolMatch[1];
    try {
      const body = await parseBody(req);
      const result = await executeToolByName(toolName, body);
      sendJson(res, result);
    } catch (error) {
      const msg = error instanceof MCPError ? error.message : String(error);
      sendError(res, msg, error instanceof MCPError ? 400 : 500);
    }
    return true;
  }

  // GET /api/status/auth
  if (pathname === '/api/status/auth' && req.method === 'GET') {
    try {
      const status = await authManager.getStatus();
      sendJson(res, status);
    } catch {
      sendError(res, 'Failed to retrieve auth status');
    }
    return true;
  }

  // GET /api/status/cache
  if (pathname === '/api/status/cache' && req.method === 'GET') {
    sendJson(res, cacheStats());
    return true;
  }

  // GET /api/status/rate-limits
  if (pathname === '/api/status/rate-limits' && req.method === 'GET') {
    try {
      const status = await rateLimiter.getAllStatus();
      sendJson(res, status);
    } catch {
      sendError(res, 'Failed to retrieve rate limit status');
    }
    return true;
  }

  return false; // Not matched
}
