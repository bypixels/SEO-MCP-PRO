/**
 * Sitemap analysis tools
 */

import { z } from 'zod';
import { defineTool, fetchUrl, validateUrlInput } from '../base.js';
import { ToolCategory } from '../../types/tools.js';
import { MCPError } from '../../types/errors.js';
import * as cheerio from 'cheerio';

/** Sitemap analysis input schema */
const SitemapAnalyzeInputSchema = z.object({
  url: z.string().describe('Sitemap URL or domain'),
  maxUrls: z.number().min(1).max(10000).optional().default(1000).describe('Maximum URLs to analyze'),
});

type SitemapAnalyzeInput = z.infer<typeof SitemapAnalyzeInputSchema>;

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

interface SitemapInfo {
  url: string;
  type: 'urlset' | 'sitemapindex' | 'unknown';
  urlCount: number;
  sitemaps?: string[];
}

interface SitemapAnalyzeOutput {
  url: string;
  found: boolean;
  type: 'urlset' | 'sitemapindex' | 'unknown';
  stats: {
    totalUrls: number;
    urlsWithLastmod: number;
    urlsWithPriority: number;
    urlsWithChangefreq: number;
  };
  urls: SitemapUrl[];
  childSitemaps?: SitemapInfo[];
  issues: {
    severity: 'error' | 'warning' | 'info';
    message: string;
  }[];
  timestamp: string;
}

// Common sitemap locations
const SITEMAP_LOCATIONS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/sitemaps/sitemap.xml',
  '/wp-sitemap.xml',
];

/**
 * Parse sitemap XML
 */
function parseSitemap(content: string, maxUrls: number): {
  type: 'urlset' | 'sitemapindex' | 'unknown';
  urls: SitemapUrl[];
  childSitemaps: string[];
} {
  const $ = cheerio.load(content, { xmlMode: true });

  // Check for sitemap index
  const sitemapElements = $('sitemap');
  if (sitemapElements.length > 0) {
    const childSitemaps: string[] = [];
    sitemapElements.each((_, el) => {
      const loc = $(el).find('loc').text().trim();
      if (loc) {
        childSitemaps.push(loc);
      }
    });
    return {
      type: 'sitemapindex',
      urls: [],
      childSitemaps,
    };
  }

  // Parse URL set
  const urlElements = $('url');
  const urls: SitemapUrl[] = [];

  urlElements.each((index, el) => {
    if (index >= maxUrls) return;

    const loc = $(el).find('loc').text().trim();
    if (!loc) return;

    const url: SitemapUrl = { loc };

    const lastmod = $(el).find('lastmod').text().trim();
    if (lastmod) url.lastmod = lastmod;

    const changefreq = $(el).find('changefreq').text().trim();
    if (changefreq) url.changefreq = changefreq;

    const priority = $(el).find('priority').text().trim();
    if (priority) {
      const p = parseFloat(priority);
      if (!isNaN(p)) url.priority = p;
    }

    urls.push(url);
  });

  return {
    type: urls.length > 0 ? 'urlset' : 'unknown',
    urls,
    childSitemaps: [],
  };
}

/**
 * Analyze sitemap for issues
 */
function analyzeSitemap(
  urls: SitemapUrl[],
  type: 'urlset' | 'sitemapindex' | 'unknown'
): SitemapAnalyzeOutput['issues'] {
  const issues: SitemapAnalyzeOutput['issues'] = [];

  if (type === 'unknown') {
    issues.push({
      severity: 'error',
      message: 'Invalid sitemap format - could not parse XML',
    });
    return issues;
  }

  if (type === 'urlset') {
    // Check for missing lastmod
    const urlsWithLastmod = urls.filter(u => u.lastmod);
    if (urlsWithLastmod.length === 0) {
      issues.push({
        severity: 'warning',
        message: 'No URLs have lastmod dates - search engines may crawl less efficiently',
      });
    } else if (urlsWithLastmod.length < urls.length * 0.5) {
      issues.push({
        severity: 'info',
        message: `Only ${Math.round(urlsWithLastmod.length / urls.length * 100)}% of URLs have lastmod dates`,
      });
    }

    // Check for stale lastmod dates
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const staleUrls = urlsWithLastmod.filter(u => {
      try {
        return new Date(u.lastmod!) < oneYearAgo;
      } catch {
        return false;
      }
    });
    if (staleUrls.length > urls.length * 0.5) {
      issues.push({
        severity: 'warning',
        message: `${Math.round(staleUrls.length / urls.length * 100)}% of URLs have lastmod dates older than 1 year`,
      });
    }

    // Check URL count
    if (urls.length > 50000) {
      issues.push({
        severity: 'error',
        message: 'Sitemap exceeds 50,000 URL limit - should be split into multiple sitemaps',
      });
    } else if (urls.length > 40000) {
      issues.push({
        severity: 'warning',
        message: 'Sitemap is approaching 50,000 URL limit',
      });
    }

    // Check for duplicate URLs
    const uniqueUrls = new Set(urls.map(u => u.loc));
    if (uniqueUrls.size < urls.length) {
      issues.push({
        severity: 'warning',
        message: `Found ${urls.length - uniqueUrls.size} duplicate URLs in sitemap`,
      });
    }

    // Check for non-canonical URLs (with query strings or fragments)
    const urlsWithParams = urls.filter(u => u.loc.includes('?') || u.loc.includes('#'));
    if (urlsWithParams.length > 0) {
      issues.push({
        severity: 'info',
        message: `${urlsWithParams.length} URLs contain query parameters or fragments`,
      });
    }

    // Check priority values
    const priorityUrls = urls.filter(u => u.priority !== undefined);
    if (priorityUrls.length > 0) {
      const allSamePriority = priorityUrls.every(u => u.priority === priorityUrls[0].priority);
      if (allSamePriority) {
        issues.push({
          severity: 'info',
          message: 'All URLs have the same priority - consider using different priorities',
        });
      }
    }
  }

  return issues;
}

/**
 * seo_sitemap_analyze tool
 */
export const sitemapAnalyzeTool = defineTool<SitemapAnalyzeInput, SitemapAnalyzeOutput>({
  name: 'seo_sitemap_analyze',
  description: 'Analyze XML sitemap structure and content. Parses URLs, validates format, and identifies SEO issues like missing lastmod dates or URL limits.',
  category: 'seo' as ToolCategory,
  inputSchema: SitemapAnalyzeInputSchema,
  cacheTTL: 3600, // 1 hour
  cacheKeyFn: (input) => `${input.url}:${input.maxUrls}`,

  async handler(input) {
    let sitemapUrl = validateUrlInput(input.url);

    // If URL doesn't end with .xml, try to find sitemap
    if (!sitemapUrl.endsWith('.xml')) {
      const parsedUrl = new URL(sitemapUrl);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

      // Try robots.txt first
      try {
        const robotsResult = await fetchUrl(`${baseUrl}/robots.txt`, { timeout: 5000 });
        if (robotsResult.status === 200) {
          const sitemapMatch = robotsResult.data.match(/Sitemap:\s*(.+)/i);
          if (sitemapMatch) {
            sitemapUrl = sitemapMatch[1].trim();
          }
        }
      } catch {
        // Ignore robots.txt errors
      }

      // If still not found, try common locations
      if (!sitemapUrl.endsWith('.xml')) {
        for (const location of SITEMAP_LOCATIONS) {
          try {
            const testUrl = `${baseUrl}${location}`;
            const result = await fetchUrl(testUrl, { timeout: 5000 });
            if (result.status === 200 && result.data.includes('<')) {
              sitemapUrl = testUrl;
              break;
            }
          } catch {
            continue;
          }
        }
      }
    }

    try {
      const result = await fetchUrl(sitemapUrl, { timeout: 30000 });

      if (result.status === 404) {
        return {
          url: sitemapUrl,
          found: false,
          type: 'unknown',
          stats: {
            totalUrls: 0,
            urlsWithLastmod: 0,
            urlsWithPriority: 0,
            urlsWithChangefreq: 0,
          },
          urls: [],
          issues: [{
            severity: 'error',
            message: 'Sitemap not found',
          }],
          timestamp: new Date().toISOString(),
        };
      }

      if (result.status !== 200) {
        throw MCPError.externalServiceError(sitemapUrl, `HTTP ${result.status}`);
      }

      // Check if it's actually XML
      if (!result.data.includes('<') || !result.data.includes('xml')) {
        return {
          url: sitemapUrl,
          found: true,
          type: 'unknown',
          stats: {
            totalUrls: 0,
            urlsWithLastmod: 0,
            urlsWithPriority: 0,
            urlsWithChangefreq: 0,
          },
          urls: [],
          issues: [{
            severity: 'error',
            message: 'Response is not valid XML',
          }],
          timestamp: new Date().toISOString(),
        };
      }

      const parsed = parseSitemap(result.data, input.maxUrls);
      const issues = analyzeSitemap(parsed.urls, parsed.type);

      // If it's a sitemap index, fetch basic info about child sitemaps
      let childSitemaps: SitemapInfo[] | undefined;
      if (parsed.type === 'sitemapindex' && parsed.childSitemaps.length > 0) {
        childSitemaps = [];
        for (const childUrl of parsed.childSitemaps.slice(0, 10)) { // Limit to first 10
          try {
            const childResult = await fetchUrl(childUrl, { timeout: 10000 });
            if (childResult.status === 200) {
              const childParsed = parseSitemap(childResult.data, 1);
              childSitemaps.push({
                url: childUrl,
                type: childParsed.type,
                urlCount: childParsed.type === 'urlset' ? childParsed.urls.length : 0,
              });
            }
          } catch {
            childSitemaps.push({
              url: childUrl,
              type: 'unknown',
              urlCount: 0,
            });
          }
        }
      }

      const stats = {
        totalUrls: parsed.urls.length,
        urlsWithLastmod: parsed.urls.filter(u => u.lastmod).length,
        urlsWithPriority: parsed.urls.filter(u => u.priority !== undefined).length,
        urlsWithChangefreq: parsed.urls.filter(u => u.changefreq).length,
      };

      return {
        url: sitemapUrl,
        found: true,
        type: parsed.type,
        stats,
        urls: parsed.urls,
        childSitemaps,
        issues,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }
      throw MCPError.externalServiceError(
        sitemapUrl,
        error instanceof Error ? error.message : 'Failed to fetch sitemap'
      );
    }
  },
});
