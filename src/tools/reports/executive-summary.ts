/**
 * Executive Summary Report tool
 */

import { z } from 'zod';
import axios from 'axios';
import { createServiceLogger } from '../../utils/logger.js';
import type { ToolDefinition } from '../../types/tools.js';
import { ToolCategory } from '../../types/tools.js';
import type { DashboardScoreCard, DashboardCWV, DashboardIssue, DashboardEnhancement } from '../../types/dashboard.js';
import { scoreToRating, generateDashboardMarkdown, generateSummary } from './formatters.js';

const log = createServiceLogger('report-executive');

const executiveSummarySchema = z.object({
  siteUrl: z.string().url().describe('Website URL'),
  dateRange: z.object({
    startDate: z.string().describe('Start date (YYYY-MM-DD)'),
    endDate: z.string().describe('End date (YYYY-MM-DD)'),
  }),
  includeSections: z.array(z.enum(['traffic', 'search', 'performance', 'security']))
    .optional()
    .describe('Sections to include in the report'),
});

type ExecutiveSummaryInput = z.infer<typeof executiveSummarySchema>;

interface ExecutiveSummaryOutput {
  siteUrl: string;
  period: { start: string; end: string };
  generatedAt: string;
  highlights: {
    type: 'positive' | 'negative' | 'neutral';
    metric: string;
    message: string;
    change?: number;
  }[];
  performance: {
    scores: { mobile: number; desktop: number };
    coreWebVitals: { lcp: string; fid: string; cls: string; inp: string };
    trend: 'improving' | 'stable' | 'declining';
  };
  security: {
    overallStatus: 'secure' | 'warnings' | 'critical';
    sslExpiry: string;
    issues: string[];
  };
  seo: {
    score: number;
    indexedPages: string;
    topIssues: string[];
  };
  recommendations: {
    priority: 'critical' | 'high' | 'medium' | 'low';
    area: string;
    recommendation: string;
  }[];
  summary: string;
  _dashboard: DashboardEnhancement;
}

// Helper to get rating text
function getRatingText(value: number, thresholds: { good: number; poor: number }, unit: string): string {
  if (value <= thresholds.good) return `${value}${unit} (Good)`;
  if (value <= thresholds.poor) return `${value}${unit} (Needs Improvement)`;
  return `${value}${unit} (Poor)`;
}

export const reportExecutiveSummaryTool: ToolDefinition<ExecutiveSummaryInput, ExecutiveSummaryOutput> = {
  name: 'report_executive_summary',
  description: 'Generates an executive summary combining performance, security, and SEO data',
  category: ToolCategory.REPORTS,
  inputSchema: executiveSummarySchema,

  async handler(input: ExecutiveSummaryInput): Promise<ExecutiveSummaryOutput> {
    log.info('Generating executive summary', { url: input.siteUrl });

    const urlObj = new URL(input.siteUrl);
    const highlights: ExecutiveSummaryOutput['highlights'] = [];
    const recommendations: ExecutiveSummaryOutput['recommendations'] = [];

    // ============================================
    // 1. Performance Analysis
    // ============================================

    const performance = {
      scores: { mobile: 0, desktop: 0 },
      coreWebVitals: { lcp: 'Unknown', fid: 'Unknown', cls: 'Unknown', inp: 'Unknown' },
      trend: 'stable' as const,
    };

    try {
      const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;

      // Get mobile score
      let mobileUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(input.siteUrl)}&strategy=MOBILE&category=PERFORMANCE`;
      if (apiKey) mobileUrl += `&key=${apiKey}`;

      const mobileResponse = await axios.get(mobileUrl, { timeout: 120000 });
      performance.scores.mobile = Math.round((mobileResponse.data.lighthouseResult?.categories?.performance?.score || 0) * 100);

      // Extract CWV from mobile
      const audits = mobileResponse.data.lighthouseResult?.audits || {};
      const fieldMetrics = mobileResponse.data.loadingExperience?.metrics || {};

      const lcpValue = fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile || audits['largest-contentful-paint']?.numericValue || 0;
      const clsValue = fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?
                       fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 :
                       audits['cumulative-layout-shift']?.numericValue || 0;
      const inpValue = fieldMetrics.INTERACTION_TO_NEXT_PAINT?.percentile || 0;
      const fidValue = fieldMetrics.FIRST_INPUT_DELAY_MS?.percentile || 0;

      performance.coreWebVitals.lcp = getRatingText(Math.round(lcpValue), { good: 2500, poor: 4000 }, 'ms');
      performance.coreWebVitals.cls = getRatingText(Math.round(clsValue * 100) / 100, { good: 0.1, poor: 0.25 }, '');
      performance.coreWebVitals.inp = inpValue > 0 ? getRatingText(Math.round(inpValue), { good: 200, poor: 500 }, 'ms') : 'No data';
      performance.coreWebVitals.fid = fidValue > 0 ? getRatingText(Math.round(fidValue), { good: 100, poor: 300 }, 'ms') : 'No data';

      // Get desktop score
      let desktopUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(input.siteUrl)}&strategy=DESKTOP&category=PERFORMANCE`;
      if (apiKey) desktopUrl += `&key=${apiKey}`;

      const desktopResponse = await axios.get(desktopUrl, { timeout: 120000 });
      performance.scores.desktop = Math.round((desktopResponse.data.lighthouseResult?.categories?.performance?.score || 0) * 100);

      // Add highlights
      if (performance.scores.mobile >= 90) {
        highlights.push({
          type: 'positive',
          metric: 'Mobile Performance',
          message: `Excellent mobile performance score: ${performance.scores.mobile}/100`,
        });
      } else if (performance.scores.mobile < 50) {
        highlights.push({
          type: 'negative',
          metric: 'Mobile Performance',
          message: `Poor mobile performance score: ${performance.scores.mobile}/100`,
        });
        recommendations.push({
          priority: 'critical',
          area: 'Performance',
          recommendation: 'Mobile performance needs urgent attention. Focus on LCP, CLS, and TBT optimizations.',
        });
      }
    } catch (error) {
      log.warn('Failed to get performance data', { error });
    }

    // ============================================
    // 2. Security Analysis
    // ============================================

    const security = {
      overallStatus: 'secure' as 'secure' | 'warnings' | 'critical',
      sslExpiry: 'Unknown',
      issues: [] as string[],
    };

    try {
      // Check HTTPS
      if (urlObj.protocol !== 'https:') {
        security.overallStatus = 'critical';
        security.issues.push('Site not using HTTPS');
        highlights.push({
          type: 'negative',
          metric: 'Security',
          message: 'Site is not using HTTPS - critical security issue',
        });
        recommendations.push({
          priority: 'critical',
          area: 'Security',
          recommendation: 'Implement HTTPS immediately to protect user data and improve SEO.',
        });
      }

      // Check security headers
      const headersResponse = await axios.head(input.siteUrl, { timeout: 10000 });
      const headers = headersResponse.headers;

      const missingHeaders: string[] = [];
      if (!headers['strict-transport-security']) missingHeaders.push('HSTS');
      if (!headers['x-content-type-options']) missingHeaders.push('X-Content-Type-Options');
      if (!headers['x-frame-options'] && !headers['content-security-policy']) missingHeaders.push('Clickjacking protection');

      if (missingHeaders.length > 0) {
        security.issues.push(`Missing security headers: ${missingHeaders.join(', ')}`);
        if (security.overallStatus === 'secure') {
          security.overallStatus = 'warnings';
        }
        recommendations.push({
          priority: 'high',
          area: 'Security',
          recommendation: `Add missing security headers: ${missingHeaders.join(', ')}`,
        });
      }

      if (security.overallStatus === 'secure') {
        highlights.push({
          type: 'positive',
          metric: 'Security',
          message: 'Site security configuration looks good',
        });
      }
    } catch (error) {
      log.warn('Failed to check security', { error });
      security.issues.push('Could not verify security configuration');
    }

    // ============================================
    // 3. SEO Analysis
    // ============================================

    const seo = {
      score: 0,
      indexedPages: 'Unknown',
      topIssues: [] as string[],
    };

    try {
      // Get SEO score from Lighthouse
      const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
      let seoUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(input.siteUrl)}&strategy=MOBILE&category=SEO`;
      if (apiKey) seoUrl += `&key=${apiKey}`;

      const seoResponse = await axios.get(seoUrl, { timeout: 120000 });
      seo.score = Math.round((seoResponse.data.lighthouseResult?.categories?.seo?.score || 0) * 100);

      // Check common SEO issues from audits
      const audits = seoResponse.data.lighthouseResult?.audits || {};

      if (audits['document-title']?.score === 0) {
        seo.topIssues.push('Missing or invalid title tag');
      }
      if (audits['meta-description']?.score === 0) {
        seo.topIssues.push('Missing meta description');
      }
      if (audits['link-text']?.score < 1) {
        seo.topIssues.push('Some links have non-descriptive text');
      }
      if (audits['crawlable-anchors']?.score < 1) {
        seo.topIssues.push('Some links are not crawlable');
      }

      if (seo.score >= 90) {
        highlights.push({
          type: 'positive',
          metric: 'SEO',
          message: `Strong SEO foundation with score of ${seo.score}/100`,
        });
      } else if (seo.score < 70) {
        highlights.push({
          type: 'negative',
          metric: 'SEO',
          message: `SEO needs improvement: ${seo.score}/100`,
        });
        recommendations.push({
          priority: 'high',
          area: 'SEO',
          recommendation: 'Address basic SEO issues: title tags, meta descriptions, and link text.',
        });
      }

      for (const issue of seo.topIssues.slice(0, 3)) {
        recommendations.push({
          priority: 'medium',
          area: 'SEO',
          recommendation: `Fix: ${issue}`,
        });
      }
    } catch (error) {
      log.warn('Failed to analyze SEO', { error });
    }

    // Sort recommendations by priority
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    const topRecommendations = recommendations.slice(0, 10);

    // Build dashboard enhancement
    const avgPerf = Math.round((performance.scores.mobile + performance.scores.desktop) / 2);
    const securityScore = security.overallStatus === 'secure' ? 90 : security.overallStatus === 'warnings' ? 60 : 30;

    const scoreCards: DashboardScoreCard[] = [
      { label: 'Performance (Mobile)', score: performance.scores.mobile, maxScore: 100, rating: scoreToRating(performance.scores.mobile) },
      { label: 'Performance (Desktop)', score: performance.scores.desktop, maxScore: 100, rating: scoreToRating(performance.scores.desktop) },
      { label: 'SEO', score: seo.score, maxScore: 100, rating: scoreToRating(seo.score) },
      { label: 'Security', score: securityScore, maxScore: 100, rating: scoreToRating(securityScore) },
    ];

    // Parse CWV strings back to numeric values for dashboard
    const parseCWVValue = (text: string): number => {
      const match = text.match(/^([\d.]+)/);
      return match ? parseFloat(match[1]) : 0;
    };
    const parseCWVRating = (text: string): DashboardCWV['rating'] => {
      if (text.includes('Good')) return 'good';
      if (text.includes('Needs Improvement')) return 'needs-improvement';
      if (text.includes('Poor')) return 'poor';
      return 'needs-improvement';
    };

    const dashboardCWV: DashboardCWV[] = [
      { name: 'LCP', value: parseCWVValue(performance.coreWebVitals.lcp), unit: 'ms', rating: parseCWVRating(performance.coreWebVitals.lcp), thresholds: { good: 2500, poor: 4000 } },
      { name: 'CLS', value: parseCWVValue(performance.coreWebVitals.cls), unit: '', rating: parseCWVRating(performance.coreWebVitals.cls), thresholds: { good: 0.1, poor: 0.25 } },
      { name: 'INP', value: parseCWVValue(performance.coreWebVitals.inp), unit: 'ms', rating: parseCWVRating(performance.coreWebVitals.inp), thresholds: { good: 200, poor: 500 } },
    ];

    const dashboardIssues: DashboardIssue[] = [
      ...security.issues.map(msg => ({
        priority: (security.overallStatus === 'critical' ? 'critical' : 'high') as DashboardIssue['priority'],
        category: 'Security',
        message: msg,
      })),
      ...seo.topIssues.map(msg => ({
        priority: 'high' as const,
        category: 'SEO',
        message: msg,
      })),
    ];

    const overallScore = Math.round((avgPerf * 0.35) + (seo.score * 0.35) + (securityScore * 0.3));
    const generatedAt = new Date().toISOString();
    const summary = generateSummary(input.siteUrl, overallScore, scoreCards, dashboardCWV);
    const markdownReport = generateDashboardMarkdown({
      url: input.siteUrl,
      generatedAt,
      overallScore,
      scores: scoreCards,
      coreWebVitals: dashboardCWV,
      issues: dashboardIssues,
      recommendations: topRecommendations,
    });

    const result: ExecutiveSummaryOutput = {
      siteUrl: input.siteUrl,
      period: { start: input.dateRange.startDate, end: input.dateRange.endDate },
      generatedAt,
      highlights,
      performance,
      security,
      seo,
      recommendations: topRecommendations,
      summary,
      _dashboard: {
        scoreCards,
        coreWebVitals: dashboardCWV,
        issues: dashboardIssues,
        markdownReport,
      },
    };

    log.info('Executive summary completed', { url: input.siteUrl });

    return result;
  },
};
