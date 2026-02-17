/**
 * Dashboard module entry point
 *
 * Creates and starts the HTTP dashboard server.
 * Also loads stored credentials on startup so they're available to both
 * MCP (stdio) and Dashboard (HTTP) transports.
 */

import type { Server } from 'node:http';
import { createDashboardServer } from './http-server.js';
import { createServiceLogger } from '../utils/logger.js';
import { DASHBOARD_DEFAULTS } from '../config/defaults.js';
import { credentialStore } from './services/credential-store.js';

const log = createServiceLogger('dashboard');

let serverInstance: Server | null = null;

/**
 * Load stored credentials into process.env.
 * Called early in startup so authManager.initialize() picks them up.
 * Safe to call even if no credential file exists.
 */
export function loadStoredCredentials(): void {
  credentialStore.load();
  credentialStore.applyToEnv();
}

/**
 * Start the dashboard HTTP server
 */
export async function startDashboard(): Promise<Server> {
  const port = parseInt(process.env.DASHBOARD_PORT || String(DASHBOARD_DEFAULTS.port), 10);

  const server = createDashboardServer();

  return new Promise((resolve, reject) => {
    server.on('error', (error: Error & { code?: string }) => {
      if (error.code === 'EADDRINUSE') {
        log.error(`Dashboard port ${port} is already in use`);
      }
      reject(error);
    });

    server.listen(port, () => {
      serverInstance = server;
      log.info(`Dashboard running at http://localhost:${port}`);
      resolve(server);
    });
  });
}

/**
 * Stop the dashboard server
 */
export async function stopDashboard(): Promise<void> {
  if (!serverInstance) return;

  return new Promise((resolve) => {
    serverInstance!.close(() => {
      log.info('Dashboard server stopped');
      serverInstance = null;
      resolve();
    });
  });
}
