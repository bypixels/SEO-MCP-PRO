/**
 * Image Accessibility Check tool
 */

import { z } from 'zod';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { createServiceLogger } from '../../utils/logger.js';
import { MCPError } from '../../types/errors.js';
import type { ToolDefinition } from '../../types/tools.js';
import { ToolCategory } from '../../types/tools.js';

const log = createServiceLogger('a11y-images');

// ============================================
// Check Images
// ============================================

const checkImagesSchema = z.object({
  url: z.string().url().describe('URL to check for image accessibility'),
});

type CheckImagesInput = z.infer<typeof checkImagesSchema>;

interface ImageInfo {
  src: string;
  alt: string | null;
  role: string | null;
  decorative: boolean;
  status: 'good' | 'missing' | 'empty' | 'suspicious';
  issue?: string;
}

interface CheckImagesOutput {
  url: string;
  images: ImageInfo[];
  summary: {
    total: number;
    withAlt: number;
    decorative: number;
    missing: number;
    empty: number;
    suspicious: number;
  };
}

// List of suspicious alt text patterns
const suspiciousPatterns = [
  /^image$/i,
  /^img$/i,
  /^photo$/i,
  /^picture$/i,
  /^graphic$/i,
  /^icon$/i,
  /^banner$/i,
  /^placeholder$/i,
  /^untitled$/i,
  /^\d+$/,
  /^DSC_?\d+/i,
  /^IMG_?\d+/i,
  /\.(jpg|jpeg|png|gif|webp|svg)$/i,
];

function isSuspiciousAlt(alt: string): boolean {
  return suspiciousPatterns.some((pattern) => pattern.test(alt.trim()));
}

export const a11yCheckImagesTool: ToolDefinition<CheckImagesInput, CheckImagesOutput> = {
  name: 'a11y_check_images',
  description: 'Checks images for proper alt text and accessibility',
  category: ToolCategory.ACCESSIBILITY,
  inputSchema: checkImagesSchema,

  async handler(input: CheckImagesInput): Promise<CheckImagesOutput> {
    log.info('Checking image accessibility', { url: input.url });

    try {
      const response = await axios.get(input.url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WebsiteOpsMCP/1.0)',
        },
      });

      const $ = cheerio.load(response.data);
      const images: ImageInfo[] = [];

      $('img').each((_, element) => {
        const $img = $(element);
        const src = $img.attr('src') || '';
        const alt = $img.attr('alt');
        const role = $img.attr('role') || null;
        const ariaHidden = $img.attr('aria-hidden');
        const ariaLabel = $img.attr('aria-label');

        // Check if image is marked as decorative
        const decorative = role === 'presentation' ||
                          role === 'none' ||
                          ariaHidden === 'true' ||
                          alt === '';

        let status: ImageInfo['status'] = 'good';
        let issue: string | undefined;

        if (alt === undefined && !ariaLabel) {
          // Missing alt attribute entirely
          status = 'missing';
          issue = 'Image is missing alt attribute';
        } else if (alt === '' && !decorative) {
          // Empty alt without being marked as decorative
          status = 'empty';
          issue = 'Image has empty alt but is not marked as decorative';
        } else if (alt && isSuspiciousAlt(alt)) {
          // Suspicious alt text
          status = 'suspicious';
          issue = `Alt text "${alt}" appears to be a placeholder or filename`;
        } else if (decorative) {
          // Properly marked decorative image
          status = 'good';
        }

        // Truncate long src URLs for readability
        const truncatedSrc = src.length > 100 ? src.substring(0, 100) + '...' : src;

        images.push({
          src: truncatedSrc,
          alt: alt !== undefined ? alt : null,
          role,
          decorative,
          status,
          issue,
        });
      });

      // Also check for background images in inline styles (basic check)
      $('[style*="background-image"]').each((_, element) => {
        const $el = $(element);
        const style = $el.attr('style') || '';
        const match = style.match(/background-image:\s*url\(['"]?([^'"()]+)['"]?\)/);

        if (match) {
          const role = $el.attr('role');
          const ariaLabel = $el.attr('aria-label');

          if (!role && !ariaLabel) {
            images.push({
              src: match[1].length > 100 ? match[1].substring(0, 100) + '...' : match[1],
              alt: null,
              role: null,
              decorative: false,
              status: 'missing',
              issue: 'Background image without accessible alternative',
            });
          }
        }
      });

      // Calculate summary
      const summary = {
        total: images.length,
        withAlt: images.filter((i) => i.alt !== null && i.status === 'good').length,
        decorative: images.filter((i) => i.decorative).length,
        missing: images.filter((i) => i.status === 'missing').length,
        empty: images.filter((i) => i.status === 'empty').length,
        suspicious: images.filter((i) => i.status === 'suspicious').length,
      };

      log.info('Image accessibility check completed', {
        url: input.url,
        total: summary.total,
        issues: summary.missing + summary.empty + summary.suspicious,
      });

      return {
        url: input.url,
        images: images.slice(0, 50), // Limit to first 50 images
        summary,
      };
    } catch (err) {
      log.error('Failed to check images', { error: err instanceof Error ? err : new Error(String(err)) });
      throw MCPError.externalServiceError('accessibility', `Failed to analyze page: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  },
};
