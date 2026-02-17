/**
 * Dashboard-specific type definitions
 */

export type ScoreRating = 'good' | 'warning' | 'poor';
export type CWVRating = 'good' | 'needs-improvement' | 'poor';
export type TrendDirection = 'up' | 'down' | 'stable';
export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface DashboardScoreCard {
  label: string;
  score: number;
  maxScore: number;
  rating: ScoreRating;
  trend?: TrendDirection;
}

export interface DashboardCWV {
  name: string;
  value: number;
  unit: string;
  rating: CWVRating;
  thresholds: { good: number; poor: number };
}

export interface DashboardIssue {
  priority: Priority;
  category: string;
  message: string;
  fix?: string;
}

export interface DashboardRecommendation {
  priority: Priority;
  area: string;
  recommendation: string;
}

/** Extended fields added to report tool outputs */
export interface DashboardEnhancement {
  scoreCards: DashboardScoreCard[];
  coreWebVitals?: DashboardCWV[];
  issues?: DashboardIssue[];
  markdownReport: string;
}

/** Unified dashboard overview output */
export interface DashboardOverviewOutput {
  url: string;
  generatedAt: string;
  overallScore: number;
  scores: DashboardScoreCard[];
  coreWebVitals: DashboardCWV[];
  issues: DashboardIssue[];
  recommendations: DashboardRecommendation[];
  _markdown: string;
}
