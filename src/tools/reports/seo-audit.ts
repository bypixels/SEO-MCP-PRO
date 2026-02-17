/**
 * SEO Audit Report tool
 */

import { z } from 'zod';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { createServiceLogger } from '../../utils/logger.js';
import type { ToolDefinition } from '../../types/tools.js';
import { ToolCategory } from '../../types/tools.js';
import type { DashboardScoreCard, DashboardIssue, DashboardEnhancement } from '../../types/dashboard.js';
import { scoreToRating, generateDashboardMarkdown, generateSummary } from './formatters.js';

const log = createServiceLogger('report-seo-audit');

const seoAuditReportSchema = z.object({
  url: z.string().url().describe('URL to audit'),
  crawlDepth: z.number().min(1).max(3).optional().describe('Depth to crawl (1-3)'),
  maxPages: z.number().min(1).max(50).optional().describe('Maximum pages to analyze'),
});

type SEOAuditReportInput = z.infer<typeof seoAuditReportSchema>;

interface PageAnalysis {
  url: string;
  title: string;
  issues: string[];
  score: number;
}

interface SEOAuditReportOutput {
  url: string;
  generatedAt: string;
  overallScore: number;
  technical: {
    robotsTxt: { status: string; issues: string[] };
    sitemap: { status: string; urls: number; issues: string[] };
    canonicals: { status: string; issues: string[] };
    redirects: { status: string; chains: number };
    https: { status: string; issues: string[] };
  };
  onPage: {
    titles: { status: string; duplicates: number; missing: number; issues: string[] };
    descriptions: { status: string; duplicates: number; missing: number; issues: string[] };
    headings: { status: string; issues: string[] };
    images: { total: number; missingAlt: number };
    links: { internal: number; external: number; broken: number };
  };
  content: {
    wordCount: { avg: number; min: number; max: number };
    thinContent: number;
    duplicateContent: number;
  };
  structuredData: {
    present: boolean;
    types: string[];
    errors: number;
    warnings: number;
  };
  pageAnalysis: PageAnalysis[];
  recommendations: {
    priority: string;
    category: string;
    issue: string;
    affectedUrls: number;
    fix: string;
  }[];
  summary: string;
  _dashboard: DashboardEnhancement;
}

export const reportSeoAuditTool: ToolDefinition<SEOAuditReportInput, SEOAuditReportOutput> = {
  name: 'report_seo_audit',
  description: 'Generates a comprehensive SEO audit report for a website',
  category: ToolCategory.REPORTS,
  inputSchema: seoAuditReportSchema,

  async handler(input: SEOAuditReportInput): Promise<SEOAuditReportOutput> {
    log.info('Generating SEO audit report', { url: input.url });

    const urlObj = new URL(input.url);
    const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
    const recommendations: SEOAuditReportOutput['recommendations'] = [];
    const pageAnalysis: PageAnalysis[] = [];

    // ============================================
    // 1. Technical SEO
    // ============================================

    // Check robots.txt
    const robotsTxt = { status: 'unknown', issues: [] as string[] };
    try {
      const robotsResponse = await axios.get(`${baseUrl}/robots.txt`, { timeout: 10000 });
      if (robotsResponse.status === 200) {
        robotsTxt.status = 'present';
        const content = robotsResponse.data;

        // Check for common issues
        if (content.includes('Disallow: /')) {
          robotsTxt.issues.push('Entire site may be blocked from crawling');
        }
        if (!content.toLowerCase().includes('sitemap:')) {
          robotsTxt.issues.push('No sitemap reference in robots.txt');
        }
      }
    } catch {
      robotsTxt.status = 'missing';
      robotsTxt.issues.push('robots.txt not found');
      recommendations.push({
        priority: 'high',
        category: 'Technical',
        issue: 'Missing robots.txt',
        affectedUrls: 1,
        fix: 'Create a robots.txt file to guide search engine crawlers',
      });
    }

    // Check sitemap
    const sitemap = { status: 'unknown', urls: 0, issues: [] as string[] };
    const sitemapUrls = [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`];

    for (const sitemapUrl of sitemapUrls) {
      try {
        const sitemapResponse = await axios.get(sitemapUrl, { timeout: 15000 });
        if (sitemapResponse.status === 200) {
          sitemap.status = 'present';
          const content = sitemapResponse.data;

          // Count URLs
          const urlMatches = content.match(/<loc>/g) || [];
          sitemap.urls = urlMatches.length;

          if (sitemap.urls === 0) {
            sitemap.issues.push('Sitemap is empty');
          }
          break;
        }
      } catch {
        // Try next URL
      }
    }

    if (sitemap.status !== 'present') {
      sitemap.status = 'missing';
      sitemap.issues.push('No sitemap found');
      recommendations.push({
        priority: 'high',
        category: 'Technical',
        issue: 'Missing XML sitemap',
        affectedUrls: 1,
        fix: 'Create and submit an XML sitemap to help search engines discover your pages',
      });
    }

    // Check HTTPS
    const https = { status: 'unknown', issues: [] as string[] };
    if (urlObj.protocol === 'https:') {
      https.status = 'enabled';
    } else {
      https.status = 'disabled';
      https.issues.push('Site is not using HTTPS');
      recommendations.push({
        priority: 'critical',
        category: 'Technical',
        issue: 'Site not using HTTPS',
        affectedUrls: 1,
        fix: 'Migrate to HTTPS for security and SEO benefits',
      });
    }

    // Initialize other technical fields
    const canonicals = { status: 'unknown', issues: [] as string[] };
    const redirects = { status: 'ok', chains: 0 };

    // ============================================
    // 2. On-Page Analysis
    // ============================================

    const titles = { status: 'unknown', duplicates: 0, missing: 0, issues: [] as string[] };
    const descriptions = { status: 'unknown', duplicates: 0, missing: 0, issues: [] as string[] };
    const headings = { status: 'unknown', issues: [] as string[] };
    const images = { total: 0, missingAlt: 0 };
    const links = { internal: 0, external: 0, broken: 0 };

    // Analyze main page
    try {
      const pageResponse = await axios.get(input.url, { timeout: 30000 });
      const $ = cheerio.load(pageResponse.data);

      // Title analysis
      const title = $('title').text().trim();
      if (!title) {
        titles.missing++;
        titles.issues.push('Page is missing title tag');
      } else if (title.length < 30) {
        titles.issues.push(`Title too short (${title.length} chars)`);
      } else if (title.length > 60) {
        titles.issues.push(`Title too long (${title.length} chars)`);
      }
      titles.status = titles.issues.length === 0 ? 'good' : 'warning';

      // Meta description analysis
      const description = $('meta[name="description"]').attr('content') || '';
      if (!description) {
        descriptions.missing++;
        descriptions.issues.push('Page is missing meta description');
      } else if (description.length < 120) {
        descriptions.issues.push(`Description too short (${description.length} chars)`);
      } else if (description.length > 160) {
        descriptions.issues.push(`Description too long (${description.length} chars)`);
      }
      descriptions.status = descriptions.issues.length === 0 ? 'good' : 'warning';

      // Heading analysis
      const h1s = $('h1');
      if (h1s.length === 0) {
        headings.issues.push('No H1 tag found');
      } else if (h1s.length > 1) {
        headings.issues.push(`Multiple H1 tags found (${h1s.length})`);
      }
      headings.status = headings.issues.length === 0 ? 'good' : 'warning';

      // Image analysis
      $('img').each((_, el) => {
        images.total++;
        const alt = $(el).attr('alt');
        if (!alt || alt.trim() === '') {
          images.missingAlt++;
        }
      });

      if (images.missingAlt > 0) {
        recommendations.push({
          priority: 'medium',
          category: 'On-Page',
          issue: `${images.missingAlt} images missing alt text`,
          affectedUrls: 1,
          fix: 'Add descriptive alt text to all images for accessibility and SEO',
        });
      }

      // Link analysis
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (href.startsWith('http') && !href.includes(urlObj.hostname)) {
          links.external++;
        } else if (href.startsWith('/') || href.startsWith(baseUrl)) {
          links.internal++;
        }
      });

      // Canonical check
      const canonical = $('link[rel="canonical"]').attr('href');
      if (!canonical) {
        canonicals.status = 'missing';
        canonicals.issues.push('No canonical tag found');
        recommendations.push({
          priority: 'medium',
          category: 'Technical',
          issue: 'Missing canonical tag',
          affectedUrls: 1,
          fix: 'Add a canonical tag to prevent duplicate content issues',
        });
      } else {
        canonicals.status = 'present';
      }

      // Add to page analysis
      const pageScore = 100 -
        (titles.issues.length * 10) -
        (descriptions.issues.length * 10) -
        (headings.issues.length * 10) -
        (images.missingAlt > 0 ? 10 : 0);

      pageAnalysis.push({
        url: input.url,
        title: title || 'No title',
        issues: [...titles.issues, ...descriptions.issues, ...headings.issues],
        score: Math.max(0, pageScore),
      });

    } catch (error) {
      log.warn('Failed to analyze page', { error });
    }

    // ============================================
    // 3. Content Analysis
    // ============================================

    const content = {
      wordCount: { avg: 0, min: 0, max: 0 },
      thinContent: 0,
      duplicateContent: 0,
    };

    try {
      const pageResponse = await axios.get(input.url, { timeout: 30000 });
      const $ = cheerio.load(pageResponse.data);

      // Get text content
      const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
      const words = bodyText.split(' ').filter(w => w.length > 0);
      const wordCount = words.length;

      content.wordCount = { avg: wordCount, min: wordCount, max: wordCount };

      if (wordCount < 300) {
        content.thinContent = 1;
        recommendations.push({
          priority: 'medium',
          category: 'Content',
          issue: 'Thin content detected',
          affectedUrls: 1,
          fix: 'Add more valuable content to improve page quality (aim for 300+ words)',
        });
      }
    } catch {
      // Ignore errors
    }

    // ============================================
    // 4. Structured Data
    // ============================================

    const structuredData = {
      present: false,
      types: [] as string[],
      errors: 0,
      warnings: 0,
    };

    try {
      const pageResponse = await axios.get(input.url, { timeout: 30000 });
      const $ = cheerio.load(pageResponse.data);

      $('script[type="application/ld+json"]').each((_, el) => {
        structuredData.present = true;
        try {
          const json = JSON.parse($(el).html() || '{}');
          if (json['@type']) {
            structuredData.types.push(json['@type']);
          }
        } catch {
          structuredData.errors++;
        }
      });

      if (!structuredData.present) {
        recommendations.push({
          priority: 'medium',
          category: 'Technical',
          issue: 'No structured data found',
          affectedUrls: 1,
          fix: 'Add Schema.org structured data to help search engines understand your content',
        });
      }
    } catch {
      // Ignore errors
    }

    // ============================================
    // Calculate Overall Score
    // ============================================

    let overallScore = 100;

    // Deduct for technical issues
    if (robotsTxt.status === 'missing') overallScore -= 10;
    if (sitemap.status === 'missing') overallScore -= 10;
    if (https.status === 'disabled') overallScore -= 20;
    if (canonicals.status === 'missing') overallScore -= 5;

    // Deduct for on-page issues
    if (titles.missing > 0) overallScore -= 10;
    if (descriptions.missing > 0) overallScore -= 10;
    if (headings.issues.length > 0) overallScore -= 5;
    if (images.missingAlt > 0) overallScore -= 5;

    // Deduct for content issues
    if (content.thinContent > 0) overallScore -= 10;

    // Deduct for missing structured data
    if (!structuredData.present) overallScore -= 5;

    overallScore = Math.max(0, overallScore);

    // Add title/description recommendations
    for (const issue of titles.issues) {
      recommendations.push({
        priority: 'high',
        category: 'On-Page',
        issue,
        affectedUrls: 1,
        fix: 'Optimize title tag to be 30-60 characters with target keywords',
      });
    }

    for (const issue of descriptions.issues) {
      recommendations.push({
        priority: 'high',
        category: 'On-Page',
        issue,
        affectedUrls: 1,
        fix: 'Optimize meta description to be 120-160 characters with a compelling message',
      });
    }

    const sortedRecommendations = recommendations.sort((a, b) => {
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
    });

    // Build dashboard enhancement
    const technicalScore = 100
      - (robotsTxt.status === 'missing' ? 25 : 0)
      - (sitemap.status === 'missing' ? 25 : 0)
      - (https.status === 'disabled' ? 30 : 0)
      - (canonicals.status === 'missing' ? 20 : 0);
    const onPageScore = Math.max(0, 100
      - (titles.missing * 25)
      - (descriptions.missing * 20)
      - (headings.issues.length * 15)
      - (images.missingAlt > 0 ? 15 : 0));
    const contentScore = content.thinContent > 0 ? 50 : (structuredData.present ? 100 : 80);

    const scoreCards: DashboardScoreCard[] = [
      { label: 'SEO Overall', score: overallScore, maxScore: 100, rating: scoreToRating(overallScore) },
      { label: 'Technical SEO', score: Math.max(0, technicalScore), maxScore: 100, rating: scoreToRating(Math.max(0, technicalScore)) },
      { label: 'On-Page SEO', score: onPageScore, maxScore: 100, rating: scoreToRating(onPageScore) },
      { label: 'Content', score: contentScore, maxScore: 100, rating: scoreToRating(contentScore) },
    ];

    const dashboardIssues: DashboardIssue[] = [
      ...robotsTxt.issues.map(msg => ({ priority: 'high' as const, category: 'Technical', message: msg })),
      ...sitemap.issues.map(msg => ({ priority: 'high' as const, category: 'Technical', message: msg })),
      ...https.issues.map(msg => ({ priority: 'critical' as const, category: 'Technical', message: msg })),
      ...canonicals.issues.map(msg => ({ priority: 'medium' as const, category: 'Technical', message: msg })),
      ...titles.issues.map(msg => ({ priority: 'high' as const, category: 'On-Page', message: msg })),
      ...descriptions.issues.map(msg => ({ priority: 'high' as const, category: 'On-Page', message: msg })),
      ...headings.issues.map(msg => ({ priority: 'medium' as const, category: 'On-Page', message: msg })),
    ];

    const generatedAt = new Date().toISOString();
    const summary = generateSummary(input.url, overallScore, scoreCards);
    const markdownReport = generateDashboardMarkdown({
      url: input.url,
      generatedAt,
      overallScore,
      scores: scoreCards,
      issues: dashboardIssues,
      recommendations: sortedRecommendations.map(r => ({
        priority: r.priority as 'critical' | 'high' | 'medium' | 'low',
        area: r.category,
        recommendation: `${r.issue} — ${r.fix}`,
      })),
    });

    const result: SEOAuditReportOutput = {
      url: input.url,
      generatedAt,
      overallScore,
      technical: {
        robotsTxt,
        sitemap,
        canonicals,
        redirects,
        https,
      },
      onPage: {
        titles,
        descriptions,
        headings,
        images,
        links,
      },
      content,
      structuredData,
      pageAnalysis,
      recommendations: sortedRecommendations,
      summary,
      _dashboard: {
        scoreCards,
        issues: dashboardIssues,
        markdownReport,
      },
    };

    log.info('SEO audit report completed', { url: input.url, overallScore });

    return result;
  },
};
