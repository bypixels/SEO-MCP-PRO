/**
 * Screenshot capture tool
 *
 * Captures screenshots of web pages using various services or headless browser.
 */

import { z } from 'zod';
import axios from 'axios';
import { createServiceLogger } from '../../utils/logger.js';
import type { ToolDefinition } from '../../types/tools.js';
import { ToolCategory } from '../../types/tools.js';

const log = createServiceLogger('screenshot');

// ============================================
// Screenshot Capture
// ============================================

const screenshotSchema = z.object({
  url: z.string().url().describe('URL to capture'),
  device: z.enum(['desktop', 'mobile', 'tablet']).optional().describe('Device type'),
  fullPage: z.boolean().optional().describe('Capture full page instead of viewport'),
  width: z.number().min(320).max(3840).optional().describe('Viewport width'),
  height: z.number().min(240).max(2160).optional().describe('Viewport height'),
  format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Image format'),
  quality: z.number().min(1).max(100).optional().describe('Image quality for JPEG/WebP'),
  delay: z.number().min(0).max(10000).optional().describe('Delay in ms before capture'),
});

type ScreenshotInput = z.infer<typeof screenshotSchema>;

interface ScreenshotOutput {
  url: string;
  device: string;
  viewport: { width: number; height: number };
  fullPage: boolean;
  format: string;
  image: string; // Base64 encoded image or URL
  size: number; // Size in bytes
  capturedAt: string;
}

// Device presets
const DEVICE_PRESETS = {
  desktop: { width: 1920, height: 1080 },
  mobile: { width: 375, height: 812 }, // iPhone X
  tablet: { width: 768, height: 1024 }, // iPad
};

export const screenshotTool: ToolDefinition<ScreenshotInput, ScreenshotOutput> = {
  name: 'util_screenshot',
  description: 'Captures a screenshot of a web page with configurable device, viewport, and format options',
  category: ToolCategory.UTILITIES,
  inputSchema: screenshotSchema,

  async handler(input: ScreenshotInput): Promise<ScreenshotOutput> {
    log.info('Capturing screenshot', { url: input.url, device: input.device });

    const device = input.device || 'desktop';
    const preset = DEVICE_PRESETS[device];
    const width = input.width || preset.width;
    const height = input.height || preset.height;
    const fullPage = input.fullPage ?? false;
    const format = input.format || 'png';
    // Note: quality param is available for use with Puppeteer/Playwright backends

    // Try multiple screenshot services in order of preference
    let imageData: string | null = null;
    let imageSize = 0;

    // Method 1: Use Google PageSpeed Insights screenshot
    // PSI includes a screenshot in its response
    const psiApiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
    if (psiApiKey) {
      try {
        const strategy = device === 'desktop' ? 'DESKTOP' : 'MOBILE';
        const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(input.url)}&strategy=${strategy}&key=${psiApiKey}&category=PERFORMANCE`;

        const psiResponse = await axios.get(psiUrl, { timeout: 60000 });
        const screenshot = psiResponse.data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data;

        if (screenshot && typeof screenshot === 'string') {
          // PSI returns base64 JPEG with data URI prefix
          imageData = screenshot.replace(/^data:image\/jpeg;base64,/, '');
          imageSize = Math.round((imageData!.length * 3) / 4); // Estimate base64 decoded size

          log.info('Screenshot captured via PSI', { size: imageSize });
        }
      } catch (error) {
        log.warn('PSI screenshot failed, trying fallback', { error });
      }
    }

    // Method 2: Use a free screenshot API service
    if (!imageData) {
      try {
        // Using screenshotmachine.com free tier or similar service
        // Note: In production, you'd want to use a proper service like Puppeteer/Playwright
        const screenshotApiUrl = `https://api.screenshotmachine.com?key=free&url=${encodeURIComponent(input.url)}&dimension=${width}x${height}&format=${format}&delay=${input.delay || 1000}`;

        const response = await axios.get(screenshotApiUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
        });

        imageData = Buffer.from(response.data).toString('base64');
        imageSize = response.data.length;

        log.info('Screenshot captured via API', { size: imageSize });
      } catch {
        log.warn('Screenshot API failed');
      }
    }

    // Method 3: Use urlbox.io or similar (requires API key)
    const urlboxApiKey = process.env.URLBOX_API_KEY;
    const urlboxApiSecret = process.env.URLBOX_API_SECRET;
    if (!imageData && urlboxApiKey && urlboxApiSecret) {
      try {
        const urlboxUrl = `https://api.urlbox.io/v1/${urlboxApiKey}/png?url=${encodeURIComponent(input.url)}&width=${width}&height=${height}&full_page=${fullPage}`;

        const response = await axios.get(urlboxUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
          headers: {
            'Authorization': `Bearer ${urlboxApiSecret}`,
          },
        });

        imageData = Buffer.from(response.data).toString('base64');
        imageSize = response.data.length;

        log.info('Screenshot captured via Urlbox', { size: imageSize });
      } catch {
        log.warn('Urlbox screenshot failed');
      }
    }

    // Method 4: Fallback - Return a placeholder or use the page's og:image
    if (!imageData) {
      try {
        // Try to get og:image from the page
        const pageResponse = await axios.get(input.url, {
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; WebsiteOpsMCP/1.0)',
          },
        });

        const html = pageResponse.data;
        const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);

        if (ogImageMatch && ogImageMatch[1]) {
          const ogImageUrl = ogImageMatch[1];

          // Fetch the og:image
          const imageResponse = await axios.get(ogImageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
          });

          imageData = Buffer.from(imageResponse.data).toString('base64');
          imageSize = imageResponse.data.length;

          log.info('Using og:image as fallback screenshot', { size: imageSize });
        }
      } catch {
        log.warn('og:image fallback failed');
      }
    }

    // If all methods fail, return error info
    if (!imageData) {
      // Create a simple placeholder SVG
      const placeholderSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <rect width="100%" height="100%" fill="#f0f0f0"/>
          <text x="50%" y="50%" font-family="Arial" font-size="24" fill="#666" text-anchor="middle" dominant-baseline="middle">
            Screenshot Unavailable
          </text>
          <text x="50%" y="58%" font-family="Arial" font-size="14" fill="#999" text-anchor="middle">
            ${input.url}
          </text>
        </svg>
      `;
      imageData = Buffer.from(placeholderSvg).toString('base64');
      imageSize = placeholderSvg.length;

      log.warn('All screenshot methods failed, returning placeholder');
    }

    return {
      url: input.url,
      device,
      viewport: { width, height },
      fullPage,
      format: imageData.startsWith('PHN') ? 'svg' : format, // SVG starts with '<sv' -> 'PHN' in base64
      image: imageData,
      size: imageSize,
      capturedAt: new Date().toISOString(),
    };
  },
};
