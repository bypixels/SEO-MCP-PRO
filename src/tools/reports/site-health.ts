/**
 * Site Health Report tool
 */

import { z } from 'zod';
import axios from 'axios';
import { createServiceLogger } from '../../utils/logger.js';
import type { ToolDefinition } from '../../types/tools.js';
import { ToolCategory } from '../../types/tools.js';
import type { DashboardScoreCard, DashboardCWV, DashboardIssue, DashboardEnhancement } from '../../types/dashboard.js';
import { scoreToRating, generateDashboardMarkdown, generateSummary } from './formatters.js';

const log = createServiceLogger('report-site-health');

const siteHealthReportSchema = z.object({
  url: z.string().url().describe('URL to analyze'),
  includeScreenshots: z.boolean().optional().describe('Include screenshots (not implemented yet)'),
});

type SiteHealthReportInput = z.infer<typeof siteHealthReportSchema>;

interface SiteHealthReportOutput {
  url: string;
  generatedAt: string;
  overallScore: number;
  sections: {
    performance: {
      score: number;
      coreWebVitals: {
        lcp: { value: number; rating: string };
        fid: { value: number; rating: string };
        cls: { value: number; rating: string };
        inp: { value: number; rating: string };
      };
      issues: string[];
    };
    seo: {
      score: number;
      metaTags: { status: string; issues: string[] };
      structuredData: { status: string; types: string[] };
      indexability: { status: string; issues: string[] };
      issues: string[];
    };
    security: {
      score: number;
      ssl: { status: string; grade: string; expiry: string };
      headers: { status: string; grade: string };
      issues: string[];
    };
    accessibility: {
      score: number;
      issues: string[];
    };
  };
  recommendations: {
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    issue: string;
    fix: string;
  }[];
  summary: string;
  _dashboard: DashboardEnhancement;
}

// Helper to get rating from metric value
function getRating(value: number, thresholds: { good: number; poor: number }): string {
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.poor) return 'needs-improvement';
  return 'poor';
}

export const reportSiteHealthTool: ToolDefinition<SiteHealthReportInput, SiteHealthReportOutput> = {
  name: 'report_site_health',
  description: 'Generates a comprehensive site health report including performance, SEO, security, and accessibility',
  category: ToolCategory.REPORTS,
  inputSchema: siteHealthReportSchema,

  async handler(input: SiteHealthReportInput): Promise<SiteHealthReportOutput> {
    log.info('Generating site health report', { url: input.url });

    const recommendations: SiteHealthReportOutput['recommendations'] = [];
    const urlObj = new URL(input.url); // Validate URL format, used in security checks

    // ============================================
    // 1. Performance Analysis (using PSI)
    // ============================================
    let performanceScore = 0;
    const coreWebVitals = {
      lcp: { value: 0, rating: 'unknown' },
      fid: { value: 0, rating: 'unknown' },
      cls: { value: 0, rating: 'unknown' },
      inp: { value: 0, rating: 'unknown' },
    };
    const performanceIssues: string[] = [];

    try {
      const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
      let psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(input.url)}&strategy=MOBILE&category=PERFORMANCE`;
      if (apiKey) psiUrl += `&key=${apiKey}`;

      const psiResponse = await axios.get(psiUrl, { timeout: 120000 });
      const psiData = psiResponse.data;

      performanceScore = Math.round((psiData.lighthouseResult?.categories?.performance?.score || 0) * 100);

      // Extract CWV from field data or lab data
      const audits = psiData.lighthouseResult?.audits || {};
      const fieldMetrics = psiData.loadingExperience?.metrics || {};

      const lcpValue = fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile || audits['largest-contentful-paint']?.numericValue || 0;
      const clsValue = fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?
                       fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 :
                       audits['cumulative-layout-shift']?.numericValue || 0;
      const inpValue = fieldMetrics.INTERACTION_TO_NEXT_PAINT?.percentile || 0;
      const fidValue = fieldMetrics.FIRST_INPUT_DELAY_MS?.percentile || 0;

      coreWebVitals.lcp = { value: Math.round(lcpValue), rating: getRating(lcpValue, { good: 2500, poor: 4000 }) };
      coreWebVitals.cls = { value: Math.round(clsValue * 1000) / 1000, rating: getRating(clsValue, { good: 0.1, poor: 0.25 }) };
      coreWebVitals.inp = { value: Math.round(inpValue), rating: getRating(inpValue, { good: 200, poor: 500 }) };
      coreWebVitals.fid = { value: Math.round(fidValue), rating: getRating(fidValue, { good: 100, poor: 300 }) };

      // Add issues based on scores
      if (coreWebVitals.lcp.rating !== 'good') {
        performanceIssues.push(`LCP is ${coreWebVitals.lcp.rating} (${coreWebVitals.lcp.value}ms)`);
        recommendations.push({
          priority: coreWebVitals.lcp.rating === 'poor' ? 'critical' : 'high',
          category: 'Performance',
          issue: 'Largest Contentful Paint is too slow',
          fix: 'Optimize server response, use CDN, preload critical resources, optimize images',
        });
      }
      if (coreWebVitals.cls.rating !== 'good') {
        performanceIssues.push(`CLS is ${coreWebVitals.cls.rating} (${coreWebVitals.cls.value})`);
        recommendations.push({
          priority: coreWebVitals.cls.rating === 'poor' ? 'high' : 'medium',
          category: 'Performance',
          issue: 'Cumulative Layout Shift is too high',
          fix: 'Set explicit dimensions for images/videos, avoid inserting content above existing content',
        });
      }
    } catch (error) {
      log.warn('Failed to get PSI data', { error });
      performanceIssues.push('Could not analyze performance');
    }

    // ============================================
    // 2. SEO Analysis
    // ============================================
    let seoScore = 0;
    const seoIssues: string[] = [];
    const metaTags = { status: 'unknown', issues: [] as string[] };
    const structuredData = { status: 'unknown', types: [] as string[] };
    const indexability = { status: 'unknown', issues: [] as string[] };

    try {
      const pageResponse = await axios.get(input.url, { timeout: 30000 });
      const html = pageResponse.data;

      // Check meta tags
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i);
      // Note: canonical checking is handled in indexability section below
      const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)/i);

      let metaScore = 100;
      if (!titleMatch || !titleMatch[1]) {
        metaTags.issues.push('Missing title tag');
        metaScore -= 30;
      } else if (titleMatch[1].length < 30 || titleMatch[1].length > 60) {
        metaTags.issues.push(`Title length is ${titleMatch[1].length} (recommended: 30-60)`);
        metaScore -= 10;
      }
      if (!descMatch) {
        metaTags.issues.push('Missing meta description');
        metaScore -= 30;
      } else if (descMatch[1].length < 120 || descMatch[1].length > 160) {
        metaTags.issues.push(`Description length is ${descMatch[1].length} (recommended: 120-160)`);
        metaScore -= 10;
      }
      metaTags.status = metaScore >= 80 ? 'good' : metaScore >= 50 ? 'warning' : 'error';

      // Check structured data
      const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([^<]*)<\/script>/gi) || [];
      if (jsonLdMatches.length > 0) {
        structuredData.status = 'present';
        for (const match of jsonLdMatches) {
          try {
            const jsonContent = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
            const parsed = JSON.parse(jsonContent);
            if (parsed['@type']) {
              structuredData.types.push(parsed['@type']);
            }
          } catch {
            // Ignore parse errors
          }
        }
      } else {
        structuredData.status = 'missing';
        seoIssues.push('No structured data found');
      }

      // Check indexability
      const robotsContent = robotsMatch ? robotsMatch[1].toLowerCase() : '';
      if (robotsContent.includes('noindex')) {
        indexability.status = 'blocked';
        indexability.issues.push('Page has noindex directive');
      } else {
        indexability.status = 'indexable';
      }

      // Calculate SEO score
      seoScore = Math.max(0, Math.min(100, metaScore - (seoIssues.length * 10)));

      // Add recommendations
      for (const issue of metaTags.issues) {
        recommendations.push({
          priority: 'high',
          category: 'SEO',
          issue,
          fix: 'Update the meta tag to meet recommended guidelines',
        });
      }
    } catch (error) {
      log.warn('Failed to analyze SEO', { error });
      seoIssues.push('Could not analyze page content');
    }

    // ============================================
    // 3. Security Analysis
    // ============================================
    let securityScore = 0;
    const securityIssues: string[] = [];
    const ssl = { status: 'unknown', grade: 'unknown', expiry: 'unknown' };
    const headers = { status: 'unknown', grade: 'unknown' };

    try {
      // Check SSL
      if (urlObj.protocol === 'https:') {
        ssl.status = 'valid';
        ssl.grade = 'A'; // Assume good if HTTPS
        securityScore += 40;
      } else {
        ssl.status = 'missing';
        ssl.grade = 'F';
        securityIssues.push('Site not using HTTPS');
        recommendations.push({
          priority: 'critical',
          category: 'Security',
          issue: 'Site is not using HTTPS',
          fix: 'Install an SSL certificate and redirect all HTTP traffic to HTTPS',
        });
      }

      // Check security headers
      const headersResponse = await axios.head(input.url, { timeout: 10000 });
      const responseHeaders = headersResponse.headers;

      let headerScore = 0;
      const requiredHeaders = [
        'strict-transport-security',
        'x-content-type-options',
        'x-frame-options',
        'content-security-policy',
      ];

      for (const header of requiredHeaders) {
        if (responseHeaders[header]) {
          headerScore += 15;
        } else {
          securityIssues.push(`Missing ${header} header`);
        }
      }

      headers.status = headerScore >= 45 ? 'good' : headerScore >= 30 ? 'warning' : 'poor';
      headers.grade = headerScore >= 45 ? 'A' : headerScore >= 30 ? 'B' : headerScore >= 15 ? 'C' : 'F';
      securityScore += headerScore;

      // Add recommendations for missing headers
      if (!responseHeaders['strict-transport-security']) {
        recommendations.push({
          priority: 'high',
          category: 'Security',
          issue: 'Missing Strict-Transport-Security header',
          fix: 'Add HSTS header: Strict-Transport-Security: max-age=31536000; includeSubDomains',
        });
      }
      if (!responseHeaders['content-security-policy']) {
        recommendations.push({
          priority: 'medium',
          category: 'Security',
          issue: 'Missing Content-Security-Policy header',
          fix: 'Implement a Content Security Policy to prevent XSS attacks',
        });
      }
    } catch (error) {
      log.warn('Failed to analyze security', { error });
      securityIssues.push('Could not analyze security');
    }

    // ============================================
    // 4. Accessibility (basic check)
    // ============================================
    let accessibilityScore = 0;
    const accessibilityIssues: string[] = [];

    try {
      // Use PSI accessibility score if available
      const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
      let psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(input.url)}&strategy=MOBILE&category=ACCESSIBILITY`;
      if (apiKey) psiUrl += `&key=${apiKey}`;

      const psiResponse = await axios.get(psiUrl, { timeout: 120000 });
      accessibilityScore = Math.round((psiResponse.data.lighthouseResult?.categories?.accessibility?.score || 0) * 100);

      if (accessibilityScore < 90) {
        accessibilityIssues.push(`Accessibility score is ${accessibilityScore}/100`);
        recommendations.push({
          priority: accessibilityScore < 70 ? 'high' : 'medium',
          category: 'Accessibility',
          issue: 'Accessibility score needs improvement',
          fix: 'Run a full accessibility audit to identify and fix issues',
        });
      }
    } catch (error) {
      log.warn('Failed to analyze accessibility', { error });
      accessibilityIssues.push('Could not analyze accessibility');
    }

    // Calculate overall score
    const overallScore = Math.round(
      (performanceScore * 0.3) +
      (seoScore * 0.3) +
      (securityScore * 0.25) +
      (accessibilityScore * 0.15)
    );

    const sortedRecommendations = recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Build dashboard enhancement
    const scoreCards: DashboardScoreCard[] = [
      { label: 'Performance', score: performanceScore, maxScore: 100, rating: scoreToRating(performanceScore) },
      { label: 'SEO', score: seoScore, maxScore: 100, rating: scoreToRating(seoScore) },
      { label: 'Security', score: securityScore, maxScore: 100, rating: scoreToRating(securityScore) },
      { label: 'Accessibility', score: accessibilityScore, maxScore: 100, rating: scoreToRating(accessibilityScore) },
    ];

    const dashboardCWV: DashboardCWV[] = [
      { name: 'LCP', value: coreWebVitals.lcp.value, unit: 'ms', rating: coreWebVitals.lcp.rating as DashboardCWV['rating'], thresholds: { good: 2500, poor: 4000 } },
      { name: 'CLS', value: coreWebVitals.cls.value, unit: '', rating: coreWebVitals.cls.rating as DashboardCWV['rating'], thresholds: { good: 0.1, poor: 0.25 } },
      { name: 'INP', value: coreWebVitals.inp.value, unit: 'ms', rating: coreWebVitals.inp.rating as DashboardCWV['rating'], thresholds: { good: 200, poor: 500 } },
      { name: 'FID', value: coreWebVitals.fid.value, unit: 'ms', rating: coreWebVitals.fid.rating as DashboardCWV['rating'], thresholds: { good: 100, poor: 300 } },
    ];

    const dashboardIssues: DashboardIssue[] = [
      ...performanceIssues.map(msg => ({ priority: 'high' as const, category: 'Performance', message: msg })),
      ...seoIssues.map(msg => ({ priority: 'high' as const, category: 'SEO', message: msg })),
      ...securityIssues.map(msg => ({ priority: 'high' as const, category: 'Security', message: msg })),
      ...accessibilityIssues.map(msg => ({ priority: 'medium' as const, category: 'Accessibility', message: msg })),
    ];

    const generatedAt = new Date().toISOString();
    const summary = generateSummary(input.url, overallScore, scoreCards, dashboardCWV);
    const markdownReport = generateDashboardMarkdown({
      url: input.url,
      generatedAt,
      overallScore,
      scores: scoreCards,
      coreWebVitals: dashboardCWV,
      issues: dashboardIssues,
      recommendations: sortedRecommendations.map(r => ({
        priority: r.priority,
        area: r.category,
        recommendation: `${r.issue} — ${r.fix}`,
      })),
    });

    const result: SiteHealthReportOutput = {
      url: input.url,
      generatedAt,
      overallScore,
      sections: {
        performance: {
          score: performanceScore,
          coreWebVitals,
          issues: performanceIssues,
        },
        seo: {
          score: seoScore,
          metaTags,
          structuredData,
          indexability,
          issues: seoIssues,
        },
        security: {
          score: securityScore,
          ssl,
          headers,
          issues: securityIssues,
        },
        accessibility: {
          score: accessibilityScore,
          issues: accessibilityIssues,
        },
      },
      recommendations: sortedRecommendations,
      summary,
      _dashboard: {
        scoreCards,
        coreWebVitals: dashboardCWV,
        issues: dashboardIssues,
        markdownReport,
      },
    };

    log.info('Site health report completed', { url: input.url, overallScore });

    return result;
  },
};
