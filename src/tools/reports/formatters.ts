/**
 * Dashboard markdown formatting helpers
 */

import type {
  DashboardScoreCard,
  DashboardCWV,
  DashboardIssue,
  DashboardRecommendation,
  ScoreRating,
  CWVRating,
  Priority,
} from '../../types/dashboard.js';

/**
 * Score to rating classification
 */
export function scoreToRating(score: number): ScoreRating {
  if (score >= 80) return 'good';
  if (score >= 50) return 'warning';
  return 'poor';
}

/**
 * Format a visual score bar: ████████░░ 82/100
 */
export function formatScoreBar(score: number, width = 10): string {
  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${clamped}/100`;
}

/**
 * Format rating with indicator
 */
export function formatRating(rating: ScoreRating | CWVRating): string {
  switch (rating) {
    case 'good': return 'Good';
    case 'warning':
    case 'needs-improvement': return 'Needs Improvement';
    case 'poor': return 'Poor';
  }
}

/**
 * Format a CWV metric line
 */
export function formatCWVMetric(cwv: DashboardCWV): string {
  const indicator = cwv.rating === 'good' ? '[PASS]' : cwv.rating === 'poor' ? '[FAIL]' : '[WARN]';
  return `${indicator} ${cwv.name}: ${cwv.value}${cwv.unit} (${formatRating(cwv.rating)})`;
}

/**
 * Format priority badge
 */
export function formatPriority(priority: Priority): string {
  return `[${priority.toUpperCase()}]`;
}

/**
 * Generate a complete markdown dashboard report
 */
export function generateDashboardMarkdown(data: {
  url: string;
  generatedAt: string;
  overallScore: number;
  scores: DashboardScoreCard[];
  coreWebVitals?: DashboardCWV[];
  issues?: DashboardIssue[];
  recommendations?: DashboardRecommendation[];
}): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Website Dashboard: ${data.url}`);
  lines.push(`Generated: ${new Date(data.generatedAt).toLocaleString()}`);
  lines.push('');

  // Overall score
  lines.push(`## Overall Score: ${data.overallScore}/100`);
  lines.push(`${formatScoreBar(data.overallScore, 20)}`);
  lines.push('');

  // Score cards
  lines.push('## Scores');
  lines.push('| Category | Score | Rating |');
  lines.push('|----------|-------|--------|');
  for (const card of data.scores) {
    lines.push(`| ${card.label} | ${formatScoreBar(card.score)} | ${formatRating(card.rating)} |`);
  }
  lines.push('');

  // Core Web Vitals
  if (data.coreWebVitals && data.coreWebVitals.length > 0) {
    lines.push('## Core Web Vitals');
    for (const cwv of data.coreWebVitals) {
      lines.push(`- ${formatCWVMetric(cwv)}`);
    }
    lines.push('');
  }

  // Issues
  if (data.issues && data.issues.length > 0) {
    lines.push(`## Issues (${data.issues.length})`);
    const grouped = groupByPriority(data.issues);
    for (const [priority, items] of grouped) {
      lines.push(`### ${formatPriority(priority as Priority)} (${items.length})`);
      for (const issue of items) {
        lines.push(`- **${issue.category}**: ${issue.message}`);
        if (issue.fix) lines.push(`  - Fix: ${issue.fix}`);
      }
    }
    lines.push('');
  }

  // Recommendations
  if (data.recommendations && data.recommendations.length > 0) {
    lines.push(`## Top Recommendations`);
    for (const rec of data.recommendations.slice(0, 10)) {
      lines.push(`- ${formatPriority(rec.priority)} **${rec.area}**: ${rec.recommendation}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate a short summary from score data
 */
export function generateSummary(
  url: string,
  overallScore: number,
  scores: DashboardScoreCard[],
  cwvs?: DashboardCWV[],
): string {
  const parts: string[] = [];
  parts.push(`${url} scores ${overallScore}/100 overall.`);

  const poor = scores.filter(s => s.rating === 'poor');
  const warnings = scores.filter(s => s.rating === 'warning');

  if (poor.length > 0) {
    parts.push(`${poor.map(s => s.label).join(', ')} need${poor.length === 1 ? 's' : ''} urgent attention.`);
  } else if (warnings.length > 0) {
    parts.push(`${warnings.map(s => s.label).join(', ')} could be improved.`);
  } else {
    parts.push('All categories are in good shape.');
  }

  if (cwvs) {
    const failingCwv = cwvs.filter(c => c.rating === 'poor');
    if (failingCwv.length > 0) {
      parts.push(`Failing CWV: ${failingCwv.map(c => `${c.name} (${c.value}${c.unit})`).join(', ')}.`);
    }
  }

  return parts.join(' ');
}

function groupByPriority<T extends { priority: Priority }>(items: T[]): [string, T[]][] {
  const order: Priority[] = ['critical', 'high', 'medium', 'low'];
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.priority) || [];
    list.push(item);
    map.set(item.priority, list);
  }
  return order.filter(p => map.has(p)).map(p => [p, map.get(p)!]);
}
