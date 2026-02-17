/**
 * Broken links checker tools
 */

import { z } from 'zod';
import type { CheerioAPI } from 'cheerio';
import axios from 'axios';
import { defineTool, fetchHtml, validateUrlInput } from '../base.js';
import { ToolCategory } from '../../types/tools.js';
import { USER_AGENT } from '../../config/defaults.js';

/** Broken links input schema */
const BrokenLinksInputSchema = z.object({
  url: z.string().describe('URL to check'),
  checkExternal: z.boolean().optional().default(true).describe('Check external links'),
  maxLinks: z.number().min(1).max(500).optional().default(100).describe('Maximum links to check'),
  timeout: z.number().min(1000).max(30000).optional().default(10000).describe('Timeout per link in ms'),
});

type BrokenLinksInput = z.infer<typeof BrokenLinksInputSchema>;

interface LinkResult {
  url: string;
  text: string;
  type: 'internal' | 'external';
  status: number;
  statusText: string;
  responseTime: number;
  error?: string;
}

interface BrokenLinksOutput {
  url: string;
  totalLinks: number;
  checkedLinks: number;
  brokenLinks: LinkResult[];
  redirectedLinks: LinkResult[];
  workingLinks: number;
  summary: {
    internal: {
      total: number;
      broken: number;
      redirected: number;
    };
    external: {
      total: number;
      broken: number;
      redirected: number;
    };
  };
  timestamp: string;
}

/**
 * Extract all links from HTML
 */
function extractLinks(
  $: CheerioAPI,
  baseUrl: string
): { url: string; text: string; type: 'internal' | 'external' }[] {
  const links: { url: string; text: string; type: 'internal' | 'external' }[] = [];
  const seen = new Set<string>();
  const baseParsed = new URL(baseUrl);

  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href')?.trim();
    const text = $el.text().trim().substring(0, 100);

    if (!href) return;

    // Skip certain links
    if (
      href.startsWith('#') ||
      href.startsWith('javascript:') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('data:')
    ) {
      return;
    }

    // Resolve relative URLs
    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(href, baseUrl).href;
    } catch {
      return;
    }

    // Remove hash
    const urlWithoutHash = absoluteUrl.split('#')[0];
    if (seen.has(urlWithoutHash)) return;
    seen.add(urlWithoutHash);

    // Determine if internal or external
    let type: 'internal' | 'external' = 'external';
    try {
      const linkParsed = new URL(absoluteUrl);
      if (linkParsed.host === baseParsed.host) {
        type = 'internal';
      }
    } catch {
      return;
    }

    links.push({ url: absoluteUrl, text, type });
  });

  return links;
}

/**
 * Check a single link
 */
async function checkLink(
  url: string,
  timeout: number
): Promise<{ status: number; statusText: string; responseTime: number; error?: string }> {
  const start = Date.now();

  try {
    const response = await axios.head(url, {
      timeout,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    // Some servers don't support HEAD, fallback to GET
    if (response.status === 405 || response.status === 501) {
      const getResponse = await axios.get(url, {
        timeout,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent': USER_AGENT,
        },
        // Only get headers, not body
        responseType: 'stream',
      });
      getResponse.data.destroy();

      return {
        status: getResponse.status,
        statusText: getResponse.statusText,
        responseTime: Date.now() - start,
      };
    }

    return {
      status: response.status,
      statusText: response.statusText,
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 0,
      statusText: 'Error',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * util_broken_links tool
 */
export const brokenLinksTool = defineTool<BrokenLinksInput, BrokenLinksOutput>({
  name: 'util_broken_links',
  description: 'Check for broken links on a page. Tests internal and external links, identifies broken (4xx/5xx) and redirected (3xx) links.',
  category: 'utilities' as ToolCategory,
  inputSchema: BrokenLinksInputSchema,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const { $ } = await fetchHtml(url);

    // Extract links
    let links = extractLinks($, url);
    const totalLinks = links.length;

    // Filter external if needed
    if (!input.checkExternal) {
      links = links.filter(l => l.type === 'internal');
    }

    // Limit links
    links = links.slice(0, input.maxLinks);

    // Check links in parallel with concurrency limit
    const CONCURRENCY = 10;
    const results: LinkResult[] = [];

    for (let i = 0; i < links.length; i += CONCURRENCY) {
      const batch = links.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (link) => {
          const check = await checkLink(link.url, input.timeout);
          return {
            ...link,
            status: check.status,
            statusText: check.statusText,
            responseTime: check.responseTime,
            error: check.error,
          };
        })
      );
      results.push(...batchResults);
    }

    // Categorize results
    const brokenLinks = results.filter(
      r => r.status === 0 || r.status >= 400
    );
    const redirectedLinks = results.filter(
      r => r.status >= 300 && r.status < 400
    );
    const workingLinks = results.filter(
      r => r.status >= 200 && r.status < 300
    ).length;

    // Calculate summary
    const internalResults = results.filter(r => r.type === 'internal');
    const externalResults = results.filter(r => r.type === 'external');

    const summary = {
      internal: {
        total: internalResults.length,
        broken: internalResults.filter(r => r.status === 0 || r.status >= 400).length,
        redirected: internalResults.filter(r => r.status >= 300 && r.status < 400).length,
      },
      external: {
        total: externalResults.length,
        broken: externalResults.filter(r => r.status === 0 || r.status >= 400).length,
        redirected: externalResults.filter(r => r.status >= 300 && r.status < 400).length,
      },
    };

    return {
      url,
      totalLinks,
      checkedLinks: results.length,
      brokenLinks,
      redirectedLinks,
      workingLinks,
      summary,
      timestamp: new Date().toISOString(),
    };
  },
});
