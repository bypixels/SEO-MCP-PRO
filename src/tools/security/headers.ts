/**
 * Security headers analysis tools
 */

import { z } from 'zod';
import { defineTool, fetchUrl, validateUrlInput } from '../base.js';
import { ToolCategory } from '../../types/tools.js';

/** Headers check input schema */
const HeadersCheckInputSchema = z.object({
  url: z.string().describe('URL to check'),
});

type HeadersCheckInput = z.infer<typeof HeadersCheckInputSchema>;

interface SecurityHeader {
  name: string;
  value: string | null;
  present: boolean;
  valid: boolean;
  grade: 'good' | 'warning' | 'bad' | 'missing';
  description: string;
  recommendation?: string;
}

interface HeadersCheckOutput {
  url: string;
  grade: string;
  score: number;
  headers: SecurityHeader[];
  missingHeaders: string[];
  recommendations: string[];
  timestamp: string;
}

// Security headers to check with their configurations
const SECURITY_HEADERS: {
  name: string;
  description: string;
  weight: number;
  validate: (value: string | null) => { valid: boolean; grade: SecurityHeader['grade']; recommendation?: string };
}[] = [
  {
    name: 'Strict-Transport-Security',
    description: 'Enforces HTTPS connections and prevents protocol downgrade attacks',
    weight: 15,
    validate: (value) => {
      if (!value) {
        return {
          valid: false,
          grade: 'missing',
          recommendation: 'Add Strict-Transport-Security header with max-age of at least 1 year (31536000)',
        };
      }
      const maxAgeMatch = value.match(/max-age=(\d+)/);
      const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
      const includeSubdomains = value.includes('includeSubDomains');
      const preload = value.includes('preload');

      if (maxAge >= 31536000 && includeSubdomains && preload) {
        return { valid: true, grade: 'good' };
      }
      if (maxAge >= 31536000) {
        return {
          valid: true,
          grade: 'warning',
          recommendation: 'Consider adding includeSubDomains and preload directives',
        };
      }
      return {
        valid: false,
        grade: 'bad',
        recommendation: 'Increase max-age to at least 31536000 (1 year)',
      };
    },
  },
  {
    name: 'Content-Security-Policy',
    description: 'Prevents XSS attacks by specifying allowed content sources',
    weight: 20,
    validate: (value) => {
      if (!value) {
        return {
          valid: false,
          grade: 'missing',
          recommendation: 'Implement Content-Security-Policy to prevent XSS attacks',
        };
      }
      // Check for unsafe directives
      if (value.includes("'unsafe-inline'") || value.includes("'unsafe-eval'")) {
        return {
          valid: true,
          grade: 'warning',
          recommendation: 'Remove unsafe-inline and unsafe-eval from CSP',
        };
      }
      if (value.includes('default-src') || value.includes('script-src')) {
        return { valid: true, grade: 'good' };
      }
      return {
        valid: true,
        grade: 'warning',
        recommendation: 'CSP appears incomplete, consider adding default-src directive',
      };
    },
  },
  {
    name: 'X-Content-Type-Options',
    description: 'Prevents MIME type sniffing attacks',
    weight: 10,
    validate: (value) => {
      if (!value) {
        return {
          valid: false,
          grade: 'missing',
          recommendation: 'Add X-Content-Type-Options: nosniff header',
        };
      }
      if (value.toLowerCase() === 'nosniff') {
        return { valid: true, grade: 'good' };
      }
      return {
        valid: false,
        grade: 'bad',
        recommendation: 'Set X-Content-Type-Options to "nosniff"',
      };
    },
  },
  {
    name: 'X-Frame-Options',
    description: 'Prevents clickjacking attacks by controlling iframe embedding',
    weight: 10,
    validate: (value) => {
      if (!value) {
        return {
          valid: false,
          grade: 'missing',
          recommendation: 'Add X-Frame-Options: DENY or SAMEORIGIN header',
        };
      }
      const normalized = value.toUpperCase();
      if (normalized === 'DENY' || normalized === 'SAMEORIGIN') {
        return { valid: true, grade: 'good' };
      }
      if (normalized.startsWith('ALLOW-FROM')) {
        return {
          valid: true,
          grade: 'warning',
          recommendation: 'ALLOW-FROM is deprecated, consider using CSP frame-ancestors',
        };
      }
      return {
        valid: false,
        grade: 'bad',
        recommendation: 'Set X-Frame-Options to DENY or SAMEORIGIN',
      };
    },
  },
  {
    name: 'X-XSS-Protection',
    description: 'Legacy XSS filter (deprecated but still checked)',
    weight: 5,
    validate: (value) => {
      if (!value) {
        return {
          valid: false,
          grade: 'missing',
          recommendation: 'Add X-XSS-Protection: 0 (or rely on CSP instead)',
        };
      }
      // Modern recommendation is to disable it and use CSP
      if (value === '0') {
        return { valid: true, grade: 'good' };
      }
      if (value.includes('1') && value.includes('mode=block')) {
        return { valid: true, grade: 'warning' };
      }
      return {
        valid: true,
        grade: 'warning',
        recommendation: 'Consider setting to 0 and relying on CSP instead',
      };
    },
  },
  {
    name: 'Referrer-Policy',
    description: 'Controls how much referrer information is shared',
    weight: 10,
    validate: (value) => {
      if (!value) {
        return {
          valid: false,
          grade: 'missing',
          recommendation: 'Add Referrer-Policy header (e.g., strict-origin-when-cross-origin)',
        };
      }
      const strictPolicies = [
        'no-referrer',
        'same-origin',
        'strict-origin',
        'strict-origin-when-cross-origin',
      ];
      if (strictPolicies.includes(value.toLowerCase())) {
        return { valid: true, grade: 'good' };
      }
      if (value.toLowerCase() === 'origin-when-cross-origin') {
        return { valid: true, grade: 'warning' };
      }
      return {
        valid: false,
        grade: 'bad',
        recommendation: 'Use a stricter referrer policy like strict-origin-when-cross-origin',
      };
    },
  },
  {
    name: 'Permissions-Policy',
    description: 'Controls browser features and APIs available to the page',
    weight: 10,
    validate: (value) => {
      if (!value) {
        return {
          valid: false,
          grade: 'missing',
          recommendation: 'Add Permissions-Policy header to control browser features',
        };
      }
      // Any permissions policy is better than none
      return { valid: true, grade: 'good' };
    },
  },
  {
    name: 'Cross-Origin-Embedder-Policy',
    description: 'Controls cross-origin resource embedding',
    weight: 5,
    validate: (value) => {
      if (!value) {
        return {
          valid: false,
          grade: 'missing',
          recommendation: 'Consider adding Cross-Origin-Embedder-Policy header',
        };
      }
      if (value === 'require-corp' || value === 'credentialless') {
        return { valid: true, grade: 'good' };
      }
      return { valid: true, grade: 'warning' };
    },
  },
  {
    name: 'Cross-Origin-Opener-Policy',
    description: 'Isolates browsing context from cross-origin documents',
    weight: 5,
    validate: (value) => {
      if (!value) {
        return {
          valid: false,
          grade: 'missing',
          recommendation: 'Consider adding Cross-Origin-Opener-Policy header',
        };
      }
      if (value === 'same-origin' || value === 'same-origin-allow-popups') {
        return { valid: true, grade: 'good' };
      }
      return { valid: true, grade: 'warning' };
    },
  },
  {
    name: 'Cross-Origin-Resource-Policy',
    description: 'Controls who can load resources',
    weight: 5,
    validate: (value) => {
      if (!value) {
        return {
          valid: false,
          grade: 'missing',
          recommendation: 'Consider adding Cross-Origin-Resource-Policy header',
        };
      }
      if (value === 'same-origin' || value === 'same-site') {
        return { valid: true, grade: 'good' };
      }
      return { valid: true, grade: 'warning' };
    },
  },
];

// Headers that should NOT be present (information leakage)
const HEADERS_TO_HIDE = [
  { name: 'Server', description: 'Reveals server software' },
  { name: 'X-Powered-By', description: 'Reveals backend technology' },
  { name: 'X-AspNet-Version', description: 'Reveals ASP.NET version' },
  { name: 'X-AspNetMvc-Version', description: 'Reveals ASP.NET MVC version' },
];

/**
 * Calculate grade from score
 */
function scoreToGrade(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 55) return 'C-';
  if (score >= 50) return 'D';
  return 'F';
}

/**
 * security_headers_check tool
 */
export const headersCheckTool = defineTool<HeadersCheckInput, HeadersCheckOutput>({
  name: 'security_headers_check',
  description: 'Analyze HTTP security headers. Checks for HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and other security headers. Returns a security grade and recommendations.',
  category: 'security' as ToolCategory,
  inputSchema: HeadersCheckInputSchema,
  cacheTTL: 1800, // 30 minutes
  cacheKeyFn: (input) => input.url,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const result = await fetchUrl(url);

    const headers: SecurityHeader[] = [];
    const missingHeaders: string[] = [];
    const recommendations: string[] = [];
    let totalWeight = 0;
    let earnedWeight = 0;

    // Check security headers
    for (const config of SECURITY_HEADERS) {
      const headerValue = result.headers[config.name.toLowerCase()] || null;
      const validation = config.validate(headerValue);

      totalWeight += config.weight;

      const header: SecurityHeader = {
        name: config.name,
        value: headerValue,
        present: headerValue !== null,
        valid: validation.valid,
        grade: validation.grade,
        description: config.description,
        recommendation: validation.recommendation,
      };

      headers.push(header);

      if (!headerValue) {
        missingHeaders.push(config.name);
      }

      if (validation.recommendation) {
        recommendations.push(validation.recommendation);
      }

      // Calculate score contribution
      if (validation.grade === 'good') {
        earnedWeight += config.weight;
      } else if (validation.grade === 'warning') {
        earnedWeight += config.weight * 0.7;
      } else if (validation.grade === 'bad') {
        earnedWeight += config.weight * 0.3;
      }
    }

    // Check for headers that should be hidden
    for (const hide of HEADERS_TO_HIDE) {
      const headerValue = result.headers[hide.name.toLowerCase()];
      if (headerValue) {
        recommendations.push(`Remove ${hide.name} header - ${hide.description}`);
        earnedWeight -= 2; // Penalty for leaking info
      }
    }

    const score = Math.max(0, Math.min(100, Math.round((earnedWeight / totalWeight) * 100)));
    const grade = scoreToGrade(score);

    return {
      url,
      grade,
      score,
      headers,
      missingHeaders,
      recommendations,
      timestamp: new Date().toISOString(),
    };
  },
});
