/**
 * SSE (Server-Sent Events) endpoint for real-time monitoring
 *
 * Streams uptime and response time checks at regular intervals.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticateRequest } from '../auth.js';
import { executeToolByName } from '../services/dashboard-data.js';
import { createServiceLogger } from '../../utils/logger.js';

const log = createServiceLogger('dashboard-sse');

const CHECK_INTERVAL_MS = 30000; // 30 seconds

/**
 * Handle SSE route. Returns true if matched.
 *
 * GET /api/sse?url=X
 */
export function handleSseRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): boolean {
  if (pathname !== '/api/sse' || req.method !== 'GET') return false;

  const auth = authenticateRequest(req);
  if (!auth.authenticated) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: auth.reason }));
    return true;
  }

  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const targetUrl = urlObj.searchParams.get('url');

  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing url parameter' }));
    return true;
  }

  // Set SSE headers (CORS is handled by the main HTTP server)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send initial event
  sendEvent(res, 'connected', { url: targetUrl, interval: CHECK_INTERVAL_MS });

  // Run periodic checks
  let active = true;

  async function runCheck() {
    if (!active) return;

    try {
      // Check uptime
      const uptimeResult = await executeToolByName('monitor_check_uptime', { url: targetUrl });
      sendEvent(res, 'uptime', uptimeResult);
    } catch (error) {
      sendEvent(res, 'error', { type: 'uptime', message: String(error) });
    }

    try {
      // Check response time
      const responseResult = await executeToolByName('monitor_response_time', { url: targetUrl });
      sendEvent(res, 'response_time', responseResult);
    } catch (error) {
      sendEvent(res, 'error', { type: 'response_time', message: String(error) });
    }
  }

  // Initial check
  runCheck();

  // Schedule periodic checks
  const interval = setInterval(runCheck, CHECK_INTERVAL_MS);

  // Clean up on disconnect
  req.on('close', () => {
    active = false;
    clearInterval(interval);
    log.debug('SSE client disconnected', { url: targetUrl });
  });

  log.debug('SSE client connected', { url: targetUrl });

  return true;
}

function sendEvent(res: ServerResponse, event: string, data: unknown): void {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Connection may have closed
  }
}
