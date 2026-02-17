/**
 * Core Web Vitals Report tool
 */

import { z } from 'zod';
import axios from 'axios';
import { createServiceLogger } from '../../utils/logger.js';
import type { ToolDefinition } from '../../types/tools.js';
import { ToolCategory } from '../../types/tools.js';

const log = createServiceLogger('cwv');

// Get API key from environment
function getApiKey(): string | undefined {
  return process.env.GOOGLE_PAGESPEED_API_KEY;
}

// ============================================
// Core Web Vitals Report
// ============================================

const cwvReportSchema = z.object({
  url: z.string().url().describe('URL to analyze'),
  includeHistory: z.boolean().optional().describe('Include historical data if available'),
});

type CWVReportInput = z.infer<typeof cwvReportSchema>;

interface MetricRating {
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}

interface CWVReportOutput {
  url: string;
  fetchedAt: string;
  mobile: {
    lcp: MetricRating;
    fid: MetricRating;
    cls: MetricRating;
    inp: MetricRating;
    ttfb: MetricRating;
    fcp: MetricRating;
    overallStatus: 'passing' | 'failing';
  };
  desktop: {
    lcp: MetricRating;
    fid: MetricRating;
    cls: MetricRating;
    inp: MetricRating;
    ttfb: MetricRating;
    fcp: MetricRating;
    overallStatus: 'passing' | 'failing';
  };
  history?: {
    date: string;
    mobile: { lcp: number; cls: number; inp: number };
    desktop: { lcp: number; cls: number; inp: number };
  }[];
  recommendations: string[];
}

// Thresholds based on Google's Core Web Vitals guidelines
const THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },      // ms
  fid: { good: 100, poor: 300 },         // ms
  cls: { good: 0.1, poor: 0.25 },        // score
  inp: { good: 200, poor: 500 },         // ms
  ttfb: { good: 800, poor: 1800 },       // ms
  fcp: { good: 1800, poor: 3000 },       // ms
};

function getRating(value: number, metric: keyof typeof THRESHOLDS): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[metric];
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

async function runPSI(url: string, strategy: 'mobile' | 'desktop', apiKey?: string) {
  let requestUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy.toUpperCase()}&category=PERFORMANCE`;
  if (apiKey) {
    requestUrl += `&key=${apiKey}`;
  }

  const response = await axios.get(requestUrl, { timeout: 120000 });
  return response.data;
}

function extractMetrics(data: Record<string, unknown>): {
  lcp: MetricRating;
  fid: MetricRating;
  cls: MetricRating;
  inp: MetricRating;
  ttfb: MetricRating;
  fcp: MetricRating;
} {
  const audits = (data.lighthouseResult as Record<string, unknown>)?.audits as Record<string, { numericValue?: number }> || {};
  const fieldMetrics = (data.loadingExperience as Record<string, unknown>)?.metrics as Record<string, { percentile?: number }> || {};

  // Prefer field data, fall back to lab data
  const lcpValue = fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile ||
                   audits['largest-contentful-paint']?.numericValue || 0;
  const fidValue = fieldMetrics.FIRST_INPUT_DELAY_MS?.percentile || 0;
  const clsValue = fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?
                   fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 :
                   audits['cumulative-layout-shift']?.numericValue || 0;
  const inpValue = fieldMetrics.INTERACTION_TO_NEXT_PAINT?.percentile || 0;
  const ttfbValue = fieldMetrics.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile ||
                    audits['server-response-time']?.numericValue || 0;
  const fcpValue = fieldMetrics.FIRST_CONTENTFUL_PAINT_MS?.percentile ||
                   audits['first-contentful-paint']?.numericValue || 0;

  return {
    lcp: { value: Math.round(lcpValue), rating: getRating(lcpValue, 'lcp') },
    fid: { value: Math.round(fidValue), rating: getRating(fidValue, 'fid') },
    cls: { value: Math.round(clsValue * 1000) / 1000, rating: getRating(clsValue, 'cls') },
    inp: { value: Math.round(inpValue), rating: getRating(inpValue, 'inp') },
    ttfb: { value: Math.round(ttfbValue), rating: getRating(ttfbValue, 'ttfb') },
    fcp: { value: Math.round(fcpValue), rating: getRating(fcpValue, 'fcp') },
  };
}

function getOverallStatus(metrics: { lcp: MetricRating; cls: MetricRating; inp: MetricRating }): 'passing' | 'failing' {
  // Core Web Vitals pass if LCP, CLS, and INP (or FID) are all good
  const coreMetrics = [metrics.lcp.rating, metrics.cls.rating, metrics.inp.rating];
  return coreMetrics.every(r => r === 'good') ? 'passing' : 'failing';
}

function generateRecommendations(mobile: CWVReportOutput['mobile'], desktop: CWVReportOutput['desktop']): string[] {
  const recommendations: string[] = [];

  // LCP recommendations
  if (mobile.lcp.rating !== 'good' || desktop.lcp.rating !== 'good') {
    recommendations.push('Improve Largest Contentful Paint (LCP): Optimize server response times, use CDN, preload critical resources, and optimize images.');
  }

  // CLS recommendations
  if (mobile.cls.rating !== 'good' || desktop.cls.rating !== 'good') {
    recommendations.push('Reduce Cumulative Layout Shift (CLS): Set explicit dimensions for images and videos, avoid inserting content above existing content, use transform animations.');
  }

  // INP recommendations
  if (mobile.inp.rating !== 'good' || desktop.inp.rating !== 'good') {
    recommendations.push('Improve Interaction to Next Paint (INP): Break up long tasks, optimize event handlers, use web workers for heavy computation.');
  }

  // TTFB recommendations
  if (mobile.ttfb.rating !== 'good' || desktop.ttfb.rating !== 'good') {
    recommendations.push('Reduce Time to First Byte (TTFB): Optimize server configuration, use caching, consider a CDN, reduce redirects.');
  }

  // FCP recommendations
  if (mobile.fcp.rating !== 'good' || desktop.fcp.rating !== 'good') {
    recommendations.push('Improve First Contentful Paint (FCP): Eliminate render-blocking resources, minify CSS, use efficient cache policy.');
  }

  if (recommendations.length === 0) {
    recommendations.push('All Core Web Vitals are passing. Continue monitoring for regressions.');
  }

  return recommendations;
}

export const cwvReportTool: ToolDefinition<CWVReportInput, CWVReportOutput> = {
  name: 'cwv_report',
  description: 'Generates a comprehensive Core Web Vitals report for a URL',
  category: ToolCategory.PERFORMANCE,
  inputSchema: cwvReportSchema,

  async handler(input: CWVReportInput): Promise<CWVReportOutput> {
    log.info('Generating Core Web Vitals report', { url: input.url });

    const apiKey = getApiKey();

    // Run PSI for both mobile and desktop in parallel
    const [mobileData, desktopData] = await Promise.all([
      runPSI(input.url, 'mobile', apiKey),
      runPSI(input.url, 'desktop', apiKey),
    ]);

    const mobileMetrics = extractMetrics(mobileData);
    const desktopMetrics = extractMetrics(desktopData);

    const mobile = {
      ...mobileMetrics,
      overallStatus: getOverallStatus(mobileMetrics),
    };

    const desktop = {
      ...desktopMetrics,
      overallStatus: getOverallStatus(desktopMetrics),
    };

    const recommendations = generateRecommendations(mobile, desktop);

    const result: CWVReportOutput = {
      url: input.url,
      fetchedAt: new Date().toISOString(),
      mobile,
      desktop,
      recommendations,
    };

    // Add history if requested and CrUX API is available
    if (input.includeHistory && apiKey) {
      try {
        const historyResponse = await axios.post(
          `https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord?key=${apiKey}`,
          { origin: new URL(input.url).origin },
          { timeout: 30000 }
        );

        if (historyResponse.data?.record?.collectionPeriods) {
          const periods = historyResponse.data.record.collectionPeriods;
          const metrics = historyResponse.data.record.metrics;

          result.history = periods.slice(0, 6).map((period: { lastDate: { year: number; month: number; day: number } }, index: number) => ({
            date: `${period.lastDate.year}-${String(period.lastDate.month).padStart(2, '0')}-${String(period.lastDate.day).padStart(2, '0')}`,
            mobile: {
              lcp: metrics.largest_contentful_paint?.percentilesTimeseries?.p75s?.[index] || 0,
              cls: (metrics.cumulative_layout_shift?.percentilesTimeseries?.p75s?.[index] || 0) / 100,
              inp: metrics.interaction_to_next_paint?.percentilesTimeseries?.p75s?.[index] || 0,
            },
            desktop: {
              lcp: metrics.largest_contentful_paint?.percentilesTimeseries?.p75s?.[index] || 0,
              cls: (metrics.cumulative_layout_shift?.percentilesTimeseries?.p75s?.[index] || 0) / 100,
              inp: metrics.interaction_to_next_paint?.percentilesTimeseries?.p75s?.[index] || 0,
            },
          }));
        }
      } catch (error) {
        log.warn('Could not fetch CrUX history', { error });
      }
    }

    log.info('Core Web Vitals report completed', {
      url: input.url,
      mobileStatus: mobile.overallStatus,
      desktopStatus: desktop.overallStatus,
    });

    return result;
  },
};
