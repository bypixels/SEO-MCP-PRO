/**
 * Dashboard HTML asset
 *
 * Reads the self-contained HTML dashboard from disk.
 * Searches multiple paths to work in both dev (tsx) and production (tsup bundle).
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

let cachedHtml: string | null = null;

/**
 * Get the dashboard HTML content.
 * Reads from file on first call, then caches in memory.
 */
export function getDashboardHtml(): string {
  if (cachedHtml) return cachedHtml;

  const currentDir = dirname(fileURLToPath(import.meta.url));

  // Try multiple paths: adjacent (dev), dist/ui (prod), project root src (fallback)
  const candidates = [
    join(currentDir, 'index.html'),
    join(currentDir, 'ui', 'index.html'),
    resolve(currentDir, '..', 'ui', 'index.html'),
    resolve(currentDir, '..', '..', 'src', 'dashboard', 'ui', 'index.html'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedHtml = readFileSync(candidate, 'utf-8');
      return cachedHtml;
    }
  }

  // If all paths fail, return minimal error page
  cachedHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Dashboard</title></head>
<body style="background:#0f1117;color:#e4e6f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="text-align:center">
<h1>Dashboard HTML not found</h1>
<p>Ensure <code>src/dashboard/ui/index.html</code> is accessible from the server.</p>
</div></body></html>`;

  return cachedHtml;
}
