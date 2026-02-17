/**
 * Tests for report formatters
 */

import { describe, it, expect } from 'vitest';
import {
  formatScoreBar,
  formatRating,
  formatCWVMetric,
} from '../../src/tools/reports/formatters.js';

describe('formatScoreBar', () => {
  it('should format a perfect score', () => {
    const bar = formatScoreBar(100);
    expect(bar).toContain('100');
    expect(bar).toContain('/100');
  });

  it('should format a zero score', () => {
    const bar = formatScoreBar(0);
    expect(bar).toContain('0');
    expect(bar).toContain('/100');
  });

  it('should format a mid-range score', () => {
    const bar = formatScoreBar(50);
    expect(bar).toContain('50');
  });

  it('should handle scores above 100 gracefully', () => {
    const bar = formatScoreBar(120);
    expect(bar).toBeDefined();
  });
});

describe('formatRating', () => {
  it('should return good indicator for good rating', () => {
    const result = formatRating('good');
    expect(result.toLowerCase()).toContain('good');
  });

  it('should return warning for needs-improvement', () => {
    const result = formatRating('needs-improvement');
    expect(result).toBeDefined();
  });

  it('should return poor indicator for poor rating', () => {
    const result = formatRating('poor');
    expect(result.toLowerCase()).toContain('poor');
  });
});

describe('formatCWVMetric', () => {
  it('should format LCP metric', () => {
    const result = formatCWVMetric({ name: 'LCP', value: 2.1, unit: 's', rating: 'good', thresholds: { good: 2.5, poor: 4 } });
    expect(result).toContain('LCP');
    expect(result).toContain('2.1');
    expect(result).toContain('s');
    expect(result).toContain('PASS');
  });

  it('should format CLS metric', () => {
    const result = formatCWVMetric({ name: 'CLS', value: 0.05, unit: '', rating: 'good', thresholds: { good: 0.1, poor: 0.25 } });
    expect(result).toContain('CLS');
    expect(result).toContain('0.05');
  });

  it('should format INP metric with warning', () => {
    const result = formatCWVMetric({ name: 'INP', value: 200, unit: 'ms', rating: 'needs-improvement', thresholds: { good: 200, poor: 500 } });
    expect(result).toContain('INP');
    expect(result).toContain('200');
    expect(result).toContain('ms');
    expect(result).toContain('WARN');
  });

  it('should format poor metric with FAIL', () => {
    const result = formatCWVMetric({ name: 'LCP', value: 5.2, unit: 's', rating: 'poor', thresholds: { good: 2.5, poor: 4 } });
    expect(result).toContain('FAIL');
  });
});
