/**
 * Meta tags analysis tools
 */

import { z } from 'zod';
import { defineTool, fetchHtml, validateUrlInput } from '../base.js';
import { ToolCategory } from '../../types/tools.js';

/** Meta tags analysis input schema */
const MetaAnalyzeInputSchema = z.object({
  url: z.string().describe('URL to analyze'),
});

type MetaAnalyzeInput = z.infer<typeof MetaAnalyzeInputSchema>;

interface MetaTag {
  type: 'name' | 'property' | 'httpEquiv' | 'charset';
  key: string;
  value: string;
}

interface OpenGraphData {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  siteName?: string;
  locale?: string;
}

interface TwitterCardData {
  card?: string;
  title?: string;
  description?: string;
  image?: string;
  site?: string;
  creator?: string;
}

interface MetaAnalyzeOutput {
  url: string;
  title: {
    value?: string;
    length: number;
    issues: string[];
  };
  description: {
    value?: string;
    length: number;
    issues: string[];
  };
  keywords?: string;
  canonical?: string;
  robots?: string;
  viewport?: string;
  charset?: string;
  language?: string;
  openGraph: OpenGraphData;
  twitterCard: TwitterCardData;
  allMetaTags: MetaTag[];
  issues: {
    severity: 'error' | 'warning' | 'info';
    message: string;
  }[];
  score: number;
  timestamp: string;
}

// Optimal lengths
const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESCRIPTION_MIN = 120;
const DESCRIPTION_MAX = 160;

/**
 * seo_meta_analyze tool
 */
export const metaAnalyzeTool = defineTool<MetaAnalyzeInput, MetaAnalyzeOutput>({
  name: 'seo_meta_analyze',
  description: 'Analyze page meta tags including title, description, Open Graph, Twitter Cards, robots, and canonical. Returns SEO issues and recommendations.',
  category: 'seo' as ToolCategory,
  inputSchema: MetaAnalyzeInputSchema,
  cacheTTL: 1800, // 30 minutes
  cacheKeyFn: (input) => input.url,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const { $ } = await fetchHtml(url);

    const issues: MetaAnalyzeOutput['issues'] = [];
    const allMetaTags: MetaTag[] = [];
    let score = 100;

    // Extract title
    const titleElement = $('title').first();
    const titleValue = titleElement.text().trim() || undefined;
    const titleLength = titleValue?.length || 0;
    const titleIssues: string[] = [];

    if (!titleValue) {
      titleIssues.push('Missing title tag');
      issues.push({ severity: 'error', message: 'Missing title tag' });
      score -= 20;
    } else {
      if (titleLength < TITLE_MIN) {
        titleIssues.push(`Too short (${titleLength} chars, recommended: ${TITLE_MIN}-${TITLE_MAX})`);
        issues.push({ severity: 'warning', message: `Title too short (${titleLength} characters)` });
        score -= 5;
      } else if (titleLength > TITLE_MAX) {
        titleIssues.push(`Too long (${titleLength} chars, recommended: ${TITLE_MIN}-${TITLE_MAX})`);
        issues.push({ severity: 'warning', message: `Title too long (${titleLength} characters, may be truncated)` });
        score -= 5;
      }
    }

    // Extract meta description
    const descriptionElement = $('meta[name="description"]').first();
    const descriptionValue = descriptionElement.attr('content')?.trim() || undefined;
    const descriptionLength = descriptionValue?.length || 0;
    const descriptionIssues: string[] = [];

    if (!descriptionValue) {
      descriptionIssues.push('Missing meta description');
      issues.push({ severity: 'error', message: 'Missing meta description' });
      score -= 15;
    } else {
      if (descriptionLength < DESCRIPTION_MIN) {
        descriptionIssues.push(`Too short (${descriptionLength} chars, recommended: ${DESCRIPTION_MIN}-${DESCRIPTION_MAX})`);
        issues.push({ severity: 'warning', message: `Meta description too short (${descriptionLength} characters)` });
        score -= 5;
      } else if (descriptionLength > DESCRIPTION_MAX) {
        descriptionIssues.push(`Too long (${descriptionLength} chars, recommended: ${DESCRIPTION_MIN}-${DESCRIPTION_MAX})`);
        issues.push({ severity: 'warning', message: `Meta description too long (${descriptionLength} characters, may be truncated)` });
        score -= 5;
      }
    }

    // Extract other meta tags
    const keywords = $('meta[name="keywords"]').attr('content');
    const canonical = $('link[rel="canonical"]').attr('href');
    const robots = $('meta[name="robots"]').attr('content');
    const viewport = $('meta[name="viewport"]').attr('content');
    const charset = $('meta[charset]').attr('charset') || $('meta[http-equiv="Content-Type"]').attr('content');
    const language = $('html').attr('lang');

    // Check canonical
    if (!canonical) {
      issues.push({ severity: 'warning', message: 'Missing canonical URL' });
      score -= 5;
    } else if (canonical !== url) {
      issues.push({ severity: 'info', message: `Canonical URL differs from current URL: ${canonical}` });
    }

    // Check viewport
    if (!viewport) {
      issues.push({ severity: 'warning', message: 'Missing viewport meta tag (important for mobile)' });
      score -= 5;
    } else if (!viewport.includes('width=device-width')) {
      issues.push({ severity: 'info', message: 'Viewport may not be optimally configured for mobile' });
    }

    // Check charset
    if (!charset) {
      issues.push({ severity: 'warning', message: 'Missing charset declaration' });
      score -= 3;
    }

    // Check language
    if (!language) {
      issues.push({ severity: 'warning', message: 'Missing lang attribute on html element' });
      score -= 3;
    }

    // Extract Open Graph tags
    const openGraph: OpenGraphData = {};
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDescription = $('meta[property="og:description"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');
    const ogUrl = $('meta[property="og:url"]').attr('content');
    const ogType = $('meta[property="og:type"]').attr('content');
    const ogSiteName = $('meta[property="og:site_name"]').attr('content');
    const ogLocale = $('meta[property="og:locale"]').attr('content');

    if (ogTitle) openGraph.title = ogTitle;
    if (ogDescription) openGraph.description = ogDescription;
    if (ogImage) openGraph.image = ogImage;
    if (ogUrl) openGraph.url = ogUrl;
    if (ogType) openGraph.type = ogType;
    if (ogSiteName) openGraph.siteName = ogSiteName;
    if (ogLocale) openGraph.locale = ogLocale;

    // Check Open Graph completeness
    if (!ogTitle || !ogDescription || !ogImage) {
      const missing = [];
      if (!ogTitle) missing.push('og:title');
      if (!ogDescription) missing.push('og:description');
      if (!ogImage) missing.push('og:image');
      issues.push({
        severity: 'warning',
        message: `Missing Open Graph tags: ${missing.join(', ')}`,
      });
      score -= 5;
    }

    // Extract Twitter Card tags
    const twitterCard: TwitterCardData = {};
    const twCard = $('meta[name="twitter:card"]').attr('content');
    const twTitle = $('meta[name="twitter:title"]').attr('content');
    const twDescription = $('meta[name="twitter:description"]').attr('content');
    const twImage = $('meta[name="twitter:image"]').attr('content');
    const twSite = $('meta[name="twitter:site"]').attr('content');
    const twCreator = $('meta[name="twitter:creator"]').attr('content');

    if (twCard) twitterCard.card = twCard;
    if (twTitle) twitterCard.title = twTitle;
    if (twDescription) twitterCard.description = twDescription;
    if (twImage) twitterCard.image = twImage;
    if (twSite) twitterCard.site = twSite;
    if (twCreator) twitterCard.creator = twCreator;

    // Check Twitter Card
    if (!twCard) {
      issues.push({ severity: 'info', message: 'Missing Twitter Card meta tags' });
      score -= 2;
    }

    // Collect all meta tags
    $('meta').each((_, el) => {
      const $el = $(el);
      const name = $el.attr('name');
      const property = $el.attr('property');
      const httpEquiv = $el.attr('http-equiv');
      const charsetAttr = $el.attr('charset');
      const content = $el.attr('content') || '';

      if (charsetAttr) {
        allMetaTags.push({ type: 'charset', key: 'charset', value: charsetAttr });
      } else if (name) {
        allMetaTags.push({ type: 'name', key: name, value: content });
      } else if (property) {
        allMetaTags.push({ type: 'property', key: property, value: content });
      } else if (httpEquiv) {
        allMetaTags.push({ type: 'httpEquiv', key: httpEquiv, value: content });
      }
    });

    // Check for duplicate tags
    const duplicates = allMetaTags
      .filter((tag, index, self) =>
        self.findIndex(t => t.type === tag.type && t.key === tag.key) !== index
      );
    if (duplicates.length > 0) {
      const dupKeys = [...new Set(duplicates.map(d => d.key))];
      issues.push({
        severity: 'warning',
        message: `Duplicate meta tags found: ${dupKeys.join(', ')}`,
      });
      score -= 3;
    }

    // Check robots tag
    if (robots) {
      const robotsLower = robots.toLowerCase();
      if (robotsLower.includes('noindex')) {
        issues.push({ severity: 'warning', message: 'Page is set to noindex' });
        score -= 10;
      }
      if (robotsLower.includes('nofollow')) {
        issues.push({ severity: 'info', message: 'Page is set to nofollow' });
      }
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));

    return {
      url,
      title: {
        value: titleValue,
        length: titleLength,
        issues: titleIssues,
      },
      description: {
        value: descriptionValue,
        length: descriptionLength,
        issues: descriptionIssues,
      },
      keywords: keywords || undefined,
      canonical: canonical || undefined,
      robots: robots || undefined,
      viewport: viewport || undefined,
      charset: charset || undefined,
      language: language || undefined,
      openGraph,
      twitterCard,
      allMetaTags,
      issues,
      score,
      timestamp: new Date().toISOString(),
    };
  },
});
