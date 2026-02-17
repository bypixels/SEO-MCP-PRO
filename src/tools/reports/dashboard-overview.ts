/**
 * Dashboard Overview tool
 *
 * Unified dashboard that calls site-health and seo-audit tools internally,
 * merging results into a single dashboard-friendly output.
 */

import { z } from 'zod';
import { createServiceLogger } from '../../utils/logger.js';
import type { ToolDefinition } from '../../types/tools.js';
import { ToolCategory } from '../../types/tools.js';
import type {
  DashboardScoreCard,
  DashboardCWV,
  DashboardIssue,
  DashboardRecommendation,
  DashboardOverviewOutput,
} from '../../types/dashboard.js';
import { scoreToRating, generateDashboardMarkdown, generateSummary } from './formatters.js';
import { getTool } from '../index.js';

const log = createServiceLogger('dashboard-overview');

const dashboardOverviewSchema = z.object({
  url: z.string().url().describe('URL to analyze'),
});

type DashboardOverviewInput = z.infer<typeof dashboardOverviewSchema>;

export const dashboardOverviewTool: ToolDefinition<DashboardOverviewInput, DashboardOverviewOutput> = {
  name: 'dashboard_overview',
  description: 'Generates a unified dashboard overview combining site health and SEO audit data with formatted markdown output',
  category: ToolCategory.REPORTS,
  inputSchema: dashboardOverviewSchema,

  async handler(input: DashboardOverviewInput): Promise<DashboardOverviewOutput> {
    log.info('Generating dashboard overview', { url: input.url });

    // Call both report tools in parallel via the registry
    const siteHealthTool = getTool('report_site_health');
    const seoAuditTool = getTool('report_seo_audit');

    const [siteHealthResult, seoAuditResult] = await Promise.allSettled([
      siteHealthTool?.handler({ url: input.url }),
      seoAuditTool?.handler({ url: input.url }),
    ]);

    // Extract data from settled results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const siteHealth = siteHealthResult.status === 'fulfilled' ? siteHealthResult.value as any : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seoAudit = seoAuditResult.status === 'fulfilled' ? seoAuditResult.value as any : null;

    if (siteHealthResult.status === 'rejected') {
      log.warn('Site health report failed', { error: siteHealthResult.reason });
    }
    if (seoAuditResult.status === 'rejected') {
      log.warn('SEO audit report failed', { error: seoAuditResult.reason });
    }

    // Build unified score cards
    const scores: DashboardScoreCard[] = [];

    if (siteHealth?._dashboard?.scoreCards) {
      scores.push(...siteHealth._dashboard.scoreCards);
    } else if (siteHealth) {
      // Fallback: build from raw sections
      scores.push(
        { label: 'Performance', score: siteHealth.sections?.performance?.score ?? 0, maxScore: 100, rating: scoreToRating(siteHealth.sections?.performance?.score ?? 0) },
        { label: 'Security', score: siteHealth.sections?.security?.score ?? 0, maxScore: 100, rating: scoreToRating(siteHealth.sections?.security?.score ?? 0) },
        { label: 'Accessibility', score: siteHealth.sections?.accessibility?.score ?? 0, maxScore: 100, rating: scoreToRating(siteHealth.sections?.accessibility?.score ?? 0) },
      );
    }

    // Add SEO scores (avoid duplicating if site-health already has SEO)
    if (seoAudit) {
      // Replace generic "SEO" card with detailed audit score
      const seoIdx = scores.findIndex(s => s.label === 'SEO');
      const seoCard: DashboardScoreCard = {
        label: 'SEO',
        score: seoAudit.overallScore ?? 0,
        maxScore: 100,
        rating: scoreToRating(seoAudit.overallScore ?? 0),
      };
      if (seoIdx >= 0) {
        scores[seoIdx] = seoCard;
      } else {
        scores.push(seoCard);
      }
    }

    // Build unified CWV
    const coreWebVitals: DashboardCWV[] = siteHealth?._dashboard?.coreWebVitals ?? [];

    // Build unified issues
    const issues: DashboardIssue[] = [
      ...(siteHealth?._dashboard?.issues ?? []),
      ...(seoAudit?._dashboard?.issues ?? []),
    ];

    // Build unified recommendations
    const recommendations: DashboardRecommendation[] = [];
    if (siteHealth?.recommendations) {
      for (const r of siteHealth.recommendations) {
        recommendations.push({
          priority: r.priority,
          area: r.category,
          recommendation: `${r.issue} — ${r.fix}`,
        });
      }
    }
    if (seoAudit?.recommendations) {
      for (const r of seoAudit.recommendations) {
        recommendations.push({
          priority: r.priority as DashboardRecommendation['priority'],
          area: r.category,
          recommendation: `${r.issue} — ${r.fix}`,
        });
      }
    }

    // Deduplicate recommendations by message
    const seen = new Set<string>();
    const uniqueRecommendations = recommendations.filter(r => {
      if (seen.has(r.recommendation)) return false;
      seen.add(r.recommendation);
      return true;
    });

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    uniqueRecommendations.sort((a, b) =>
      (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4)
    );

    // Calculate overall score
    const overallScore = scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
      : 0;

    const generatedAt = new Date().toISOString();

    // Generate markdown
    const _markdown = generateDashboardMarkdown({
      url: input.url,
      generatedAt,
      overallScore,
      scores,
      coreWebVitals,
      issues,
      recommendations: uniqueRecommendations.slice(0, 15),
    });

    const summaryText = generateSummary(input.url, overallScore, scores, coreWebVitals);

    log.info('Dashboard overview completed', { url: input.url, overallScore, scores: scores.length });

    return {
      url: input.url,
      generatedAt,
      overallScore,
      scores,
      coreWebVitals,
      issues,
      recommendations: uniqueRecommendations.slice(0, 15),
      _markdown: `${summaryText}\n\n${_markdown}`,
    };
  },
};
