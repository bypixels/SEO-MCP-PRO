/**
 * Redirect and canonical analysis tools
 */

import { z } from 'zod';
import axios from 'axios';
import { defineTool, validateUrlInput } from '../base.js';
import { ToolCategory } from '../../types/tools.js';
import { USER_AGENT } from '../../config/defaults.js';

/** Redirect check input schema */
const RedirectCheckInputSchema = z.object({
  url: z.string().describe('URL to check'),
  maxRedirects: z.number().min(1).max(20).optional().default(10),
});

type RedirectCheckInput = z.infer<typeof RedirectCheckInputSchema>;

interface RedirectHop {
  url: string;
  statusCode: number;
  location?: string;
  responseTime: number;
}

interface RedirectCheckOutput {
  originalUrl: string;
  finalUrl: string;
  totalRedirects: number;
  chain: RedirectHop[];
  issues: {
    severity: 'error' | 'warning' | 'info';
    message: string;
  }[];
  timestamp: string;
}

/**
 * Follow redirects and collect chain
 */
async function followRedirects(
  url: string,
  maxRedirects: number
): Promise<{ chain: RedirectHop[]; finalUrl: string }> {
  const chain: RedirectHop[] = [];
  let currentUrl = url;
  const visited = new Set<string>();

  for (let i = 0; i <= maxRedirects; i++) {
    if (visited.has(currentUrl)) {
      // Circular redirect detected
      break;
    }
    visited.add(currentUrl);

    const start = Date.now();
    try {
      const response = await axios.get(currentUrl, {
        maxRedirects: 0,
        validateStatus: () => true,
        timeout: 10000,
        headers: { 'User-Agent': USER_AGENT },
      });

      const responseTime = Date.now() - start;
      const hop: RedirectHop = {
        url: currentUrl,
        statusCode: response.status,
        responseTime,
      };

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers['location'];
        if (location) {
          hop.location = location;
          // Handle relative URLs
          if (location.startsWith('/')) {
            const parsed = new URL(currentUrl);
            currentUrl = `${parsed.protocol}//${parsed.host}${location}`;
          } else if (!location.startsWith('http')) {
            const parsed = new URL(currentUrl);
            currentUrl = `${parsed.protocol}//${parsed.host}/${location}`;
          } else {
            currentUrl = location;
          }
        }
        chain.push(hop);
      } else {
        chain.push(hop);
        break;
      }
    } catch {
      chain.push({
        url: currentUrl,
        statusCode: 0,
        responseTime: Date.now() - start,
      });
      break;
    }
  }

  return {
    chain,
    finalUrl: chain.length > 0 ? chain[chain.length - 1].url : url,
  };
}

/**
 * seo_redirect_check tool
 */
export const redirectCheckTool = defineTool<RedirectCheckInput, RedirectCheckOutput>({
  name: 'seo_redirect_check',
  description: 'Follow and analyze redirect chains. Identifies redirect loops, long chains, and mixed protocol issues.',
  category: 'seo' as ToolCategory,
  inputSchema: RedirectCheckInputSchema,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const issues: RedirectCheckOutput['issues'] = [];

    const { chain, finalUrl } = await followRedirects(url, input.maxRedirects);

    const totalRedirects = chain.length - 1; // Exclude final destination

    // Check for redirect issues
    if (totalRedirects > 3) {
      issues.push({
        severity: 'warning',
        message: `Long redirect chain: ${totalRedirects} redirects`,
      });
    }

    // Check for redirect loops
    const urls = chain.map(h => h.url);
    const uniqueUrls = new Set(urls);
    if (uniqueUrls.size < urls.length) {
      issues.push({
        severity: 'error',
        message: 'Redirect loop detected',
      });
    }

    // Check for 302 redirects that should be 301
    const tempRedirects = chain.filter(h => h.statusCode === 302);
    if (tempRedirects.length > 0) {
      issues.push({
        severity: 'info',
        message: `${tempRedirects.length} temporary (302) redirect(s) found - consider 301 for permanent redirects`,
      });
    }

    // Check for mixed HTTP/HTTPS
    const protocols = chain.map(h => new URL(h.url).protocol);
    if (protocols.includes('http:') && protocols.includes('https:')) {
      const httpToHttps = chain.find((h) =>
        new URL(h.url).protocol === 'http:' &&
        h.location &&
        h.location.startsWith('https:')
      );
      if (!httpToHttps) {
        issues.push({
          severity: 'warning',
          message: 'Mixed HTTP/HTTPS in redirect chain',
        });
      }
    }

    // Check if original URL was HTTP and redirected to HTTPS
    if (url.startsWith('http://') && finalUrl.startsWith('https://')) {
      issues.push({
        severity: 'info',
        message: 'HTTP to HTTPS redirect is properly configured',
      });
    }

    // Check for slow redirects
    const slowRedirects = chain.filter(h => h.responseTime > 1000);
    if (slowRedirects.length > 0) {
      issues.push({
        severity: 'warning',
        message: `${slowRedirects.length} slow redirect(s) (>1s response time)`,
      });
    }

    // Check final status
    const finalHop = chain[chain.length - 1];
    if (finalHop && finalHop.statusCode >= 400) {
      issues.push({
        severity: 'error',
        message: `Redirect chain ends with error: HTTP ${finalHop.statusCode}`,
      });
    }

    return {
      originalUrl: url,
      finalUrl,
      totalRedirects: Math.max(0, totalRedirects),
      chain,
      issues,
      timestamp: new Date().toISOString(),
    };
  },
});

/** Canonical check input schema */
const CanonicalCheckInputSchema = z.object({
  url: z.string().describe('URL to check'),
});

type CanonicalCheckInput = z.infer<typeof CanonicalCheckInputSchema>;

interface CanonicalCheckOutput {
  url: string;
  canonical: string | null;
  isCanonical: boolean;
  httpHeaderCanonical: string | null;
  htmlCanonical: string | null;
  issues: {
    severity: 'error' | 'warning' | 'info';
    message: string;
  }[];
  timestamp: string;
}

/**
 * seo_canonical_check tool
 */
export const canonicalCheckTool = defineTool<CanonicalCheckInput, CanonicalCheckOutput>({
  name: 'seo_canonical_check',
  description: 'Check canonical URL configuration. Validates both HTTP header and HTML link canonicals, detects conflicts and issues.',
  category: 'seo' as ToolCategory,
  inputSchema: CanonicalCheckInputSchema,
  cacheTTL: 1800, // 30 minutes
  cacheKeyFn: (input) => input.url,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const issues: CanonicalCheckOutput['issues'] = [];

    // Fetch page to get both headers and HTML
    const response = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': USER_AGENT },
      validateStatus: () => true,
    });

    // Check HTTP Link header for canonical
    let httpHeaderCanonical: string | null = null;
    const linkHeader = response.headers['link'];
    if (linkHeader) {
      const canonicalMatch = linkHeader.match(/<([^>]+)>;\s*rel=["']?canonical["']?/i);
      if (canonicalMatch) {
        httpHeaderCanonical = canonicalMatch[1];
      }
    }

    // Check HTML for canonical
    let htmlCanonical: string | null = null;
    if (typeof response.data === 'string') {
      const $ = await import('cheerio').then(m => m.load(response.data));
      htmlCanonical = $('link[rel="canonical"]').attr('href') || null;
    }

    // Determine effective canonical
    const canonical = httpHeaderCanonical || htmlCanonical;

    // Normalize URLs for comparison
    const normalizeUrl = (u: string): string => {
      try {
        const parsed = new URL(u);
        // Remove trailing slash, lowercase
        return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, '')}${parsed.search}`.toLowerCase();
      } catch {
        return u.toLowerCase();
      }
    };

    const normalizedUrl = normalizeUrl(url);
    const normalizedCanonical = canonical ? normalizeUrl(canonical) : null;
    const isCanonical = normalizedCanonical === normalizedUrl;

    // Check for issues
    if (!canonical) {
      issues.push({
        severity: 'warning',
        message: 'No canonical URL specified',
      });
    }

    // Check for conflicting canonicals
    if (httpHeaderCanonical && htmlCanonical) {
      const normalizedHttp = normalizeUrl(httpHeaderCanonical);
      const normalizedHtml = normalizeUrl(htmlCanonical);
      if (normalizedHttp !== normalizedHtml) {
        issues.push({
          severity: 'error',
          message: 'Conflicting canonical URLs in HTTP header and HTML',
        });
      }
    }

    // Check if canonical is relative (should be absolute)
    if (htmlCanonical && !htmlCanonical.startsWith('http')) {
      issues.push({
        severity: 'warning',
        message: 'Canonical URL should be absolute (start with https://)',
      });
    }

    // Check if canonical points to different domain
    if (canonical) {
      try {
        const canonicalHost = new URL(canonical).host;
        const pageHost = new URL(url).host;
        if (canonicalHost !== pageHost) {
          issues.push({
            severity: 'info',
            message: `Canonical points to different domain: ${canonicalHost}`,
          });
        }
      } catch {
        // Invalid URL
      }
    }

    // Check protocol mismatch
    if (canonical && url.startsWith('https://') && canonical.startsWith('http://')) {
      issues.push({
        severity: 'warning',
        message: 'Canonical URL uses HTTP while page uses HTTPS',
      });
    }

    // Self-referencing canonical check
    if (canonical && !isCanonical) {
      issues.push({
        severity: 'info',
        message: `Page has a canonical pointing to different URL: ${canonical}`,
      });
    }

    return {
      url,
      canonical,
      isCanonical,
      httpHeaderCanonical,
      htmlCanonical,
      issues,
      timestamp: new Date().toISOString(),
    };
  },
});
