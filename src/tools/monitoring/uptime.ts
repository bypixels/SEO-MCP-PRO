/**
 * Uptime monitoring tools
 */

import { z } from 'zod';
import * as tls from 'tls';
import { defineTool, fetchUrl, validateUrlInput } from '../base.js';
import { ToolCategory } from '../../types/tools.js';

/** Check uptime input schema */
const CheckUptimeInputSchema = z.object({
  url: z.string().describe('URL to check'),
  method: z.enum(['GET', 'HEAD']).optional().default('GET'),
  timeout: z.number().min(1000).max(60000).optional().default(30000),
  expectedStatus: z.array(z.number()).optional(),
  checkContent: z.string().optional().describe('String to find in response'),
});

type CheckUptimeInput = z.infer<typeof CheckUptimeInputSchema>;

interface SSLInfo {
  valid: boolean;
  expiresIn: number;
  issuer: string;
}

interface CheckUptimeOutput {
  url: string;
  status: 'up' | 'down' | 'degraded';
  statusCode: number;
  responseTime: number;
  headers: Record<string, string>;
  ssl?: SSLInfo;
  contentCheck?: {
    found: boolean;
    snippet?: string;
  };
  timestamp: string;
}

/**
 * Get SSL certificate info
 */
async function getSSLInfo(hostname: string): Promise<SSLInfo | undefined> {
  return new Promise((resolve) => {
    try {
      const options = {
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: false,
      };

      const socket = tls.connect(options, () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();

        if (!cert || !cert.valid_to) {
          resolve(undefined);
          return;
        }

        const expiryDate = new Date(cert.valid_to);
        const now = new Date();
        const daysUntilExpiry = Math.floor(
          (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        resolve({
          valid: socket.authorized || daysUntilExpiry > 0,
          expiresIn: daysUntilExpiry,
          issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
        });
      });

      socket.on('error', () => {
        resolve(undefined);
      });

      socket.setTimeout(5000, () => {
        socket.destroy();
        resolve(undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

/**
 * monitor_check_uptime tool
 */
export const checkUptimeTool = defineTool<CheckUptimeInput, CheckUptimeOutput>({
  name: 'monitor_check_uptime',
  description: 'Check if a URL is accessible and measure response time. Returns status, response time, headers, and SSL info.',
  category: 'monitoring' as ToolCategory,
  inputSchema: CheckUptimeInputSchema,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const parsedUrl = new URL(url);

    const result = await fetchUrl(url, {
      method: input.method,
      timeout: input.timeout,
    });

    // Determine status
    let status: 'up' | 'down' | 'degraded' = 'up';
    const expectedStatuses = input.expectedStatus || [200, 201, 204, 301, 302, 304];

    if (!expectedStatuses.includes(result.status)) {
      if (result.status >= 500) {
        status = 'down';
      } else if (result.status >= 400) {
        status = 'degraded';
      }
    }

    // Check content if specified
    let contentCheck: CheckUptimeOutput['contentCheck'];
    if (input.checkContent) {
      const found = result.data.includes(input.checkContent);
      contentCheck = {
        found,
        snippet: found
          ? result.data.substring(
              Math.max(0, result.data.indexOf(input.checkContent) - 20),
              result.data.indexOf(input.checkContent) + input.checkContent.length + 20
            )
          : undefined,
      };

      if (!found) {
        status = 'degraded';
      }
    }

    // Get SSL info for HTTPS URLs
    let ssl: SSLInfo | undefined;
    if (parsedUrl.protocol === 'https:') {
      ssl = await getSSLInfo(parsedUrl.hostname);
    }

    return {
      url,
      status,
      statusCode: result.status,
      responseTime: result.responseTime,
      headers: result.headers,
      ssl,
      contentCheck,
      timestamp: new Date().toISOString(),
    };
  },
});

/** Response time input schema */
const ResponseTimeInputSchema = z.object({
  url: z.string().describe('URL to measure'),
  samples: z.number().min(1).max(10).optional().default(3),
});

type ResponseTimeInput = z.infer<typeof ResponseTimeInputSchema>;

interface ResponseTimeOutput {
  url: string;
  measurements: {
    sample: number;
    responseTime: number;
    statusCode: number;
  }[];
  average: number;
  min: number;
  max: number;
  timestamp: string;
}

/**
 * monitor_response_time tool
 */
export const responseTimeTool = defineTool<ResponseTimeInput, ResponseTimeOutput>({
  name: 'monitor_response_time',
  description: 'Measure response time with multiple samples. Returns individual measurements and statistics.',
  category: 'monitoring' as ToolCategory,
  inputSchema: ResponseTimeInputSchema,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const measurements: ResponseTimeOutput['measurements'] = [];

    for (let i = 0; i < input.samples; i++) {
      const result = await fetchUrl(url, { method: 'GET' });
      measurements.push({
        sample: i + 1,
        responseTime: result.responseTime,
        statusCode: result.status,
      });

      // Small delay between samples
      if (i < input.samples - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const times = measurements.map((m) => m.responseTime);

    return {
      url,
      measurements,
      average: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      min: Math.min(...times),
      max: Math.max(...times),
      timestamp: new Date().toISOString(),
    };
  },
});
