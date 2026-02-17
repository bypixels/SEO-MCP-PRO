/**
 * Robots.txt analysis tools
 */

import { z } from 'zod';
import { defineTool, fetchUrl, validateUrlInput } from '../base.js';
import { ToolCategory } from '../../types/tools.js';
import { MCPError } from '../../types/errors.js';

/** Robots.txt analysis input schema */
const RobotsAnalyzeInputSchema = z.object({
  url: z.string().describe('URL or domain to analyze'),
});

type RobotsAnalyzeInput = z.infer<typeof RobotsAnalyzeInputSchema>;

interface RobotRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
  crawlDelay?: number;
}

interface RobotsAnalyzeOutput {
  url: string;
  found: boolean;
  rules: RobotRule[];
  sitemaps: string[];
  host?: string;
  issues: {
    severity: 'error' | 'warning' | 'info';
    message: string;
  }[];
  raw?: string;
  timestamp: string;
}

/**
 * Parse robots.txt content
 */
function parseRobotsTxt(content: string): {
  rules: RobotRule[];
  sitemaps: string[];
  host?: string;
} {
  const rules: RobotRule[] = [];
  const sitemaps: string[] = [];
  let host: string | undefined;

  let currentRule: RobotRule | null = null;

  const lines = content.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const directive = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();

    switch (directive) {
      case 'user-agent':
        // Save previous rule if exists
        if (currentRule) {
          rules.push(currentRule);
        }
        currentRule = {
          userAgent: value,
          allow: [],
          disallow: [],
        };
        break;

      case 'allow':
        if (currentRule) {
          currentRule.allow.push(value);
        }
        break;

      case 'disallow':
        if (currentRule) {
          currentRule.disallow.push(value);
        }
        break;

      case 'crawl-delay':
        if (currentRule) {
          const delay = parseFloat(value);
          if (!isNaN(delay)) {
            currentRule.crawlDelay = delay;
          }
        }
        break;

      case 'sitemap':
        if (value) {
          sitemaps.push(value);
        }
        break;

      case 'host':
        if (value) {
          host = value;
        }
        break;
    }
  }

  // Don't forget the last rule
  if (currentRule) {
    rules.push(currentRule);
  }

  return { rules, sitemaps, host };
}

/**
 * Analyze robots.txt for issues
 */
function analyzeRobotsTxt(
  rules: RobotRule[],
  sitemaps: string[]
): RobotsAnalyzeOutput['issues'] {
  const issues: RobotsAnalyzeOutput['issues'] = [];

  // Check for missing rules
  if (rules.length === 0) {
    issues.push({
      severity: 'warning',
      message: 'No user-agent rules defined',
    });
  }

  // Check for wildcard user-agent
  const hasWildcard = rules.some(r => r.userAgent === '*');
  if (!hasWildcard) {
    issues.push({
      severity: 'info',
      message: 'No wildcard (*) user-agent rule found - specific crawlers only',
    });
  }

  // Check for sitemap
  if (sitemaps.length === 0) {
    issues.push({
      severity: 'warning',
      message: 'No sitemap directive found in robots.txt',
    });
  }

  // Check for blocking all crawlers
  const wildcardRule = rules.find(r => r.userAgent === '*');
  if (wildcardRule?.disallow.includes('/')) {
    issues.push({
      severity: 'error',
      message: 'Site is blocking all crawlers with "Disallow: /"',
    });
  }

  // Check for blocking common important paths
  const importantPaths = ['/css', '/js', '/images', '/assets'];
  for (const rule of rules) {
    for (const path of importantPaths) {
      if (rule.disallow.some(d => d.startsWith(path))) {
        issues.push({
          severity: 'warning',
          message: `Blocking ${path} may prevent proper page rendering for search engines`,
        });
      }
    }
  }

  // Check for very long crawl delays
  for (const rule of rules) {
    if (rule.crawlDelay && rule.crawlDelay > 10) {
      issues.push({
        severity: 'warning',
        message: `High crawl-delay (${rule.crawlDelay}s) for ${rule.userAgent} may slow indexing`,
      });
    }
  }

  // Check sitemap URLs
  for (const sitemap of sitemaps) {
    if (!sitemap.startsWith('http')) {
      issues.push({
        severity: 'error',
        message: `Invalid sitemap URL (must be absolute): ${sitemap}`,
      });
    }
  }

  return issues;
}

/**
 * seo_robots_analyze tool
 */
export const robotsAnalyzeTool = defineTool<RobotsAnalyzeInput, RobotsAnalyzeOutput>({
  name: 'seo_robots_analyze',
  description: 'Analyze robots.txt file. Parses rules, sitemaps, and identifies SEO issues like blocking important paths or missing directives.',
  category: 'seo' as ToolCategory,
  inputSchema: RobotsAnalyzeInputSchema,
  cacheTTL: 3600, // 1 hour
  cacheKeyFn: (input) => input.url,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;

    try {
      const result = await fetchUrl(robotsUrl, { timeout: 10000 });

      if (result.status === 404) {
        return {
          url: robotsUrl,
          found: false,
          rules: [],
          sitemaps: [],
          issues: [{
            severity: 'warning',
            message: 'No robots.txt file found - all crawlers allowed by default',
          }],
          timestamp: new Date().toISOString(),
        };
      }

      if (result.status !== 200) {
        throw MCPError.externalServiceError(robotsUrl, `HTTP ${result.status}`);
      }

      // Check content type
      const contentType = result.headers['content-type'] || '';
      if (!contentType.includes('text/plain') && !contentType.includes('text/html')) {
        return {
          url: robotsUrl,
          found: true,
          rules: [],
          sitemaps: [],
          issues: [{
            severity: 'warning',
            message: `Unexpected content-type: ${contentType} (should be text/plain)`,
          }],
          raw: result.data.substring(0, 1000),
          timestamp: new Date().toISOString(),
        };
      }

      const parsed = parseRobotsTxt(result.data);
      const issues = analyzeRobotsTxt(parsed.rules, parsed.sitemaps);

      return {
        url: robotsUrl,
        found: true,
        rules: parsed.rules,
        sitemaps: parsed.sitemaps,
        host: parsed.host,
        issues,
        raw: result.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }
      throw MCPError.externalServiceError(
        robotsUrl,
        error instanceof Error ? error.message : 'Failed to fetch robots.txt'
      );
    }
  },
});

/** Test URL against robots.txt input schema */
const RobotsTestInputSchema = z.object({
  url: z.string().describe('URL to test'),
  userAgent: z.string().optional().default('*').describe('User agent to test'),
});

type RobotsTestInput = z.infer<typeof RobotsTestInputSchema>;

interface RobotsTestOutput {
  url: string;
  userAgent: string;
  allowed: boolean;
  matchedRule?: {
    directive: 'allow' | 'disallow';
    pattern: string;
  };
  timestamp: string;
}

/**
 * Test if a URL is allowed by robots.txt
 */
function testUrlAgainstRules(
  path: string,
  rules: RobotRule[],
  userAgent: string
): { allowed: boolean; matchedRule?: RobotsTestOutput['matchedRule'] } {
  // Find matching user-agent rule
  let matchingRule = rules.find(r => r.userAgent.toLowerCase() === userAgent.toLowerCase());
  if (!matchingRule) {
    matchingRule = rules.find(r => r.userAgent === '*');
  }

  if (!matchingRule) {
    return { allowed: true }; // No rules means allowed
  }

  // Find most specific matching rule
  let bestMatch: { type: 'allow' | 'disallow'; pattern: string } | null = null;
  let bestLength = 0;

  for (const pattern of matchingRule.allow) {
    if (pathMatches(path, pattern) && pattern.length > bestLength) {
      bestMatch = { type: 'allow', pattern };
      bestLength = pattern.length;
    }
  }

  for (const pattern of matchingRule.disallow) {
    if (pathMatches(path, pattern) && pattern.length > bestLength) {
      bestMatch = { type: 'disallow', pattern };
      bestLength = pattern.length;
    }
  }

  if (!bestMatch) {
    return { allowed: true };
  }

  return {
    allowed: bestMatch.type === 'allow',
    matchedRule: {
      directive: bestMatch.type,
      pattern: bestMatch.pattern,
    },
  };
}

/**
 * Check if path matches robots.txt pattern
 */
function pathMatches(path: string, pattern: string): boolean {
  if (!pattern) return false;

  // Convert robots.txt pattern to regex
  let regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\*/g, '.*'); // * matches anything

  // $ at end means exact match
  if (pattern.endsWith('$')) {
    regexPattern = regexPattern.slice(0, -2) + '$';
  } else {
    regexPattern = '^' + regexPattern;
  }

  try {
    const regex = new RegExp(regexPattern);
    return regex.test(path);
  } catch {
    // Invalid regex, fall back to prefix match
    return path.startsWith(pattern.replace(/\*|\$/g, ''));
  }
}

/**
 * seo_robots_test tool
 */
export const robotsTestTool = defineTool<RobotsTestInput, RobotsTestOutput>({
  name: 'seo_robots_test',
  description: 'Test if a specific URL is allowed or blocked by robots.txt rules for a given user agent.',
  category: 'seo' as ToolCategory,
  inputSchema: RobotsTestInputSchema,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;

    try {
      const result = await fetchUrl(robotsUrl, { timeout: 10000 });

      if (result.status === 404 || result.status !== 200) {
        // No robots.txt means everything is allowed
        return {
          url,
          userAgent: input.userAgent,
          allowed: true,
          timestamp: new Date().toISOString(),
        };
      }

      const parsed = parseRobotsTxt(result.data);
      const path = parsedUrl.pathname + parsedUrl.search;
      const testResult = testUrlAgainstRules(path, parsed.rules, input.userAgent);

      return {
        url,
        userAgent: input.userAgent,
        allowed: testResult.allowed,
        matchedRule: testResult.matchedRule,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }
      throw MCPError.externalServiceError(
        robotsUrl,
        error instanceof Error ? error.message : 'Failed to test URL'
      );
    }
  },
});
