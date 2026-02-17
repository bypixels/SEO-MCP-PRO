/**
 * Color Contrast Check tool
 */

import { z } from 'zod';
import axios from 'axios';
// cheerio import removed - not needed for this tool
import { createServiceLogger } from '../../utils/logger.js';
import { MCPError, ErrorCode } from '../../types/errors.js';
import type { ToolDefinition } from '../../types/tools.js';
import { ToolCategory } from '../../types/tools.js';

const log = createServiceLogger('a11y-contrast');

// ============================================
// Check Contrast
// ============================================

const checkContrastSchema = z.object({
  url: z.string().url().optional().describe('URL to analyze for contrast issues'),
  foreground: z.string().optional().describe('Foreground color in hex (e.g., #333333)'),
  background: z.string().optional().describe('Background color in hex (e.g., #FFFFFF)'),
  fontSize: z.number().optional().describe('Font size in pixels'),
  isBold: z.boolean().optional().describe('Whether the text is bold'),
});

type CheckContrastInput = z.infer<typeof checkContrastSchema>;

interface ContrastResult {
  aa: {
    normalText: 'pass' | 'fail';
    largeText: 'pass' | 'fail';
  };
  aaa: {
    normalText: 'pass' | 'fail';
    largeText: 'pass' | 'fail';
  };
}

interface CheckContrastOutput {
  ratio: number;
  aa: ContrastResult['aa'];
  aaa: ContrastResult['aaa'];
  pageAnalysis?: {
    totalElements: number;
    passing: number;
    failing: {
      element: string;
      foreground: string;
      background: string;
      ratio: number;
      required: number;
    }[];
  };
}

// Helper to convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// Helper to calculate relative luminance
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Helper to calculate contrast ratio
function getContrastRatio(fg: string, bg: string): number {
  const fgRgb = hexToRgb(fg);
  const bgRgb = hexToRgb(bg);

  if (!fgRgb || !bgRgb) return 0;

  const fgLum = getLuminance(fgRgb.r, fgRgb.g, fgRgb.b);
  const bgLum = getLuminance(bgRgb.r, bgRgb.g, bgRgb.b);

  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);

  return (lighter + 0.05) / (darker + 0.05);
}

// Check if contrast passes WCAG requirements
function checkWcagContrast(ratio: number, fontSize?: number, isBold?: boolean): ContrastResult {
  // Large text is defined as 18pt (24px) or 14pt (18.67px) if bold
  // Note: isLargeText calculation kept for future use in enhanced contrast checks
  const _isLargeText = fontSize
    ? (fontSize >= 24 || (isBold && fontSize >= 18.67))
    : false;
  void _isLargeText; // Silence unused variable warning

  return {
    aa: {
      normalText: ratio >= 4.5 ? 'pass' : 'fail',
      largeText: ratio >= 3 ? 'pass' : 'fail',
    },
    aaa: {
      normalText: ratio >= 7 ? 'pass' : 'fail',
      largeText: ratio >= 4.5 ? 'pass' : 'fail',
    },
  };
}

export const a11yCheckContrastTool: ToolDefinition<CheckContrastInput, CheckContrastOutput> = {
  name: 'a11y_check_contrast',
  description: 'Checks color contrast ratios for WCAG compliance',
  category: ToolCategory.ACCESSIBILITY,
  inputSchema: checkContrastSchema,

  async handler(input: CheckContrastInput): Promise<CheckContrastOutput> {
    log.info('Checking color contrast', input);

    // If specific colors are provided, check them directly
    if (input.foreground && input.background) {
      const ratio = getContrastRatio(input.foreground, input.background);
      const result = checkWcagContrast(ratio, input.fontSize, input.isBold);

      return {
        ratio: Math.round(ratio * 100) / 100,
        aa: result.aa,
        aaa: result.aaa,
      };
    }

    // If URL is provided, analyze the page
    if (input.url) {
      try {
        // Use Lighthouse accessibility score which includes contrast checks
        const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
        let psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(input.url)}&strategy=MOBILE&category=ACCESSIBILITY`;
        if (apiKey) psiUrl += `&key=${apiKey}`;

        const response = await axios.get(psiUrl, { timeout: 120000 });
        const data = response.data;

        const colorContrastAudit = data.lighthouseResult?.audits?.['color-contrast'];
        const failing: { element: string; foreground: string; background: string; ratio: number; required: number }[] = [];
        let totalElements = 0;
        let passing = 0;

        if (colorContrastAudit) {
          if (colorContrastAudit.score === 1) {
            // All elements pass
            totalElements = colorContrastAudit.details?.items?.length || 0;
            passing = totalElements;
          } else if (colorContrastAudit.details?.items) {
            for (const item of colorContrastAudit.details.items) {
              totalElements++;
              const contrastRatio = item.node?.contrastRatio || 0;

              if (contrastRatio < 4.5) {
                failing.push({
                  element: item.node?.selector || item.selector || 'unknown',
                  foreground: item.node?.foreground || 'unknown',
                  background: item.node?.background || 'unknown',
                  ratio: Math.round(contrastRatio * 100) / 100,
                  required: 4.5,
                });
              } else {
                passing++;
              }
            }
          }
        }

        // Calculate overall ratio (average of failing elements or default)
        const avgRatio = failing.length > 0
          ? failing.reduce((sum: number, f: { ratio: number }) => sum + f.ratio, 0) / failing.length
          : 4.5; // Default to passing ratio if all pass

        const result = checkWcagContrast(avgRatio);

        return {
          ratio: Math.round(avgRatio * 100) / 100,
          aa: result.aa,
          aaa: result.aaa,
          pageAnalysis: {
            totalElements,
            passing,
            failing: failing.slice(0, 10), // Return top 10 failing elements
          },
        };
      } catch (err) {
        log.error('Failed to analyze page contrast', { error: err instanceof Error ? err : new Error(String(err)) });
        throw MCPError.externalServiceError('accessibility', `Failed to analyze page: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    throw new MCPError({
      code: ErrorCode.INVALID_PARAMS,
      message: 'Either url or both foreground and background colors must be provided',
      retryable: false,
    });
  },
};
