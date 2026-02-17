/**
 * Technology detection tools
 */

import { z } from 'zod';
import { defineTool, fetchHtml, validateUrlInput } from '../base.js';
import { ToolCategory } from '../../types/tools.js';

/** Tech detection input schema */
const TechDetectionInputSchema = z.object({
  url: z.string().describe('URL to analyze'),
});

type TechDetectionInput = z.infer<typeof TechDetectionInputSchema>;

interface DetectedTechnology {
  name: string;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  version?: string;
  evidence: string;
}

interface TechDetectionOutput {
  url: string;
  technologies: DetectedTechnology[];
  categories: {
    [category: string]: string[];
  };
  timestamp: string;
}

// Technology detection signatures
interface TechSignature {
  name: string;
  category: string;
  patterns: {
    html?: RegExp[];
    headers?: { name: string; pattern?: RegExp }[];
    scripts?: RegExp[];
    meta?: { name?: string; content?: RegExp }[];
    cookies?: { name: string; pattern?: RegExp }[];
    globalVars?: string[];
  };
  versionPatterns?: RegExp[];
}

const TECH_SIGNATURES: TechSignature[] = [
  // CMS
  {
    name: 'WordPress',
    category: 'CMS',
    patterns: {
      html: [/wp-content/i, /wp-includes/i, /wp-json/i],
      headers: [{ name: 'x-powered-by', pattern: /WordPress/i }],
      meta: [{ name: 'generator', content: /WordPress/i }],
    },
    versionPatterns: [/WordPress\s*([\d.]+)/i],
  },
  {
    name: 'Drupal',
    category: 'CMS',
    patterns: {
      html: [/sites\/default\/files/i, /Drupal/i],
      headers: [{ name: 'x-drupal-cache' }, { name: 'x-generator', pattern: /Drupal/i }],
      meta: [{ name: 'generator', content: /Drupal/i }],
    },
    versionPatterns: [/Drupal\s*([\d.]+)/i],
  },
  {
    name: 'Joomla',
    category: 'CMS',
    patterns: {
      html: [/\/media\/jui/i, /\/components\/com_/i],
      meta: [{ name: 'generator', content: /Joomla/i }],
    },
    versionPatterns: [/Joomla!\s*([\d.]+)/i],
  },
  {
    name: 'Shopify',
    category: 'E-commerce',
    patterns: {
      html: [/cdn\.shopify\.com/i, /shopify\.com/i],
      headers: [{ name: 'x-shopid' }, { name: 'x-shardid' }],
      scripts: [/cdn\.shopify\.com/i],
    },
  },
  {
    name: 'WooCommerce',
    category: 'E-commerce',
    patterns: {
      html: [/woocommerce/i, /wc-/i],
      scripts: [/woocommerce/i],
    },
  },
  {
    name: 'Magento',
    category: 'E-commerce',
    patterns: {
      html: [/Mage\.Cookies/i, /\/static\/version/i],
      headers: [{ name: 'x-magento-vary' }],
      scripts: [/mage\/cookies/i],
    },
  },

  // JavaScript Frameworks
  {
    name: 'React',
    category: 'JavaScript Framework',
    patterns: {
      html: [/data-reactroot/i, /data-reactid/i, /__NEXT_DATA__/i],
      scripts: [/react\.production\.min\.js/i, /react-dom/i],
    },
  },
  {
    name: 'Next.js',
    category: 'JavaScript Framework',
    patterns: {
      html: [/__NEXT_DATA__/i, /_next\/static/i],
      scripts: [/_next\/static/i],
    },
  },
  {
    name: 'Vue.js',
    category: 'JavaScript Framework',
    patterns: {
      html: [/data-v-[a-f0-9]/i, /v-cloak/i],
      scripts: [/vue\.js/i, /vue\.min\.js/i, /vue\.runtime/i],
    },
  },
  {
    name: 'Nuxt.js',
    category: 'JavaScript Framework',
    patterns: {
      html: [/__NUXT__/i, /_nuxt\//i],
      scripts: [/_nuxt\//i],
    },
  },
  {
    name: 'Angular',
    category: 'JavaScript Framework',
    patterns: {
      html: [/ng-version/i, /ng-app/i, /\*ngIf/i, /\*ngFor/i],
      scripts: [/angular\.js/i, /angular\.min\.js/i, /zone\.js/i],
    },
  },
  {
    name: 'jQuery',
    category: 'JavaScript Library',
    patterns: {
      scripts: [/jquery[.-]?(\d+\.)?(\d+\.)?(\*|\d+)?\.min\.js/i, /jquery\.js/i],
    },
    versionPatterns: [/jquery[.-]([\d.]+)/i],
  },
  {
    name: 'Bootstrap',
    category: 'CSS Framework',
    patterns: {
      html: [/class="[^"]*\b(container|row|col-)\b/i],
      scripts: [/bootstrap\.min\.js/i, /bootstrap\.bundle/i],
    },
  },
  {
    name: 'Tailwind CSS',
    category: 'CSS Framework',
    patterns: {
      html: [/class="[^"]*\b(flex|grid|p-\d|m-\d|text-\w+-\d|bg-\w+-\d)\b/i],
    },
  },

  // Analytics & Marketing
  {
    name: 'Google Analytics',
    category: 'Analytics',
    patterns: {
      html: [/google-analytics\.com\/analytics\.js/i, /gtag/i, /UA-\d+-\d+/i, /G-[A-Z0-9]+/i],
      scripts: [/googletagmanager\.com/i, /google-analytics\.com/i],
    },
  },
  {
    name: 'Google Tag Manager',
    category: 'Tag Manager',
    patterns: {
      html: [/googletagmanager\.com\/gtm\.js/i, /GTM-[A-Z0-9]+/i],
      scripts: [/googletagmanager\.com/i],
    },
  },
  {
    name: 'Facebook Pixel',
    category: 'Analytics',
    patterns: {
      html: [/connect\.facebook\.net/i, /fbq\(/i],
      scripts: [/connect\.facebook\.net/i],
    },
  },
  {
    name: 'Hotjar',
    category: 'Analytics',
    patterns: {
      html: [/static\.hotjar\.com/i, /hotjar/i],
      scripts: [/static\.hotjar\.com/i],
    },
  },

  // CDN & Hosting
  {
    name: 'Cloudflare',
    category: 'CDN',
    patterns: {
      headers: [
        { name: 'cf-ray' },
        { name: 'cf-cache-status' },
        { name: 'server', pattern: /cloudflare/i },
      ],
    },
  },
  {
    name: 'AWS CloudFront',
    category: 'CDN',
    patterns: {
      headers: [
        { name: 'x-amz-cf-id' },
        { name: 'x-amz-cf-pop' },
      ],
    },
  },
  {
    name: 'Fastly',
    category: 'CDN',
    patterns: {
      headers: [
        { name: 'x-served-by', pattern: /cache/i },
        { name: 'x-fastly-request-id' },
      ],
    },
  },
  {
    name: 'Vercel',
    category: 'Hosting',
    patterns: {
      headers: [
        { name: 'x-vercel-id' },
        { name: 'server', pattern: /Vercel/i },
      ],
    },
  },
  {
    name: 'Netlify',
    category: 'Hosting',
    patterns: {
      headers: [
        { name: 'x-nf-request-id' },
        { name: 'server', pattern: /Netlify/i },
      ],
    },
  },

  // Web Servers
  {
    name: 'Nginx',
    category: 'Web Server',
    patterns: {
      headers: [{ name: 'server', pattern: /nginx/i }],
    },
    versionPatterns: [/nginx\/([\d.]+)/i],
  },
  {
    name: 'Apache',
    category: 'Web Server',
    patterns: {
      headers: [{ name: 'server', pattern: /Apache/i }],
    },
    versionPatterns: [/Apache\/([\d.]+)/i],
  },
  {
    name: 'LiteSpeed',
    category: 'Web Server',
    patterns: {
      headers: [{ name: 'server', pattern: /LiteSpeed/i }],
    },
  },

  // Security
  {
    name: 'Sucuri',
    category: 'Security',
    patterns: {
      headers: [
        { name: 'x-sucuri-id' },
        { name: 'server', pattern: /Sucuri/i },
      ],
    },
  },
  {
    name: 'Imperva',
    category: 'Security',
    patterns: {
      headers: [{ name: 'x-iinfo' }],
    },
  },

  // Programming Languages
  {
    name: 'PHP',
    category: 'Programming Language',
    patterns: {
      headers: [{ name: 'x-powered-by', pattern: /PHP/i }],
      html: [/\.php/i],
    },
    versionPatterns: [/PHP\/([\d.]+)/i],
  },
  {
    name: 'ASP.NET',
    category: 'Programming Language',
    patterns: {
      headers: [
        { name: 'x-powered-by', pattern: /ASP\.NET/i },
        { name: 'x-aspnet-version' },
      ],
    },
  },
  {
    name: 'Node.js',
    category: 'Programming Language',
    patterns: {
      headers: [{ name: 'x-powered-by', pattern: /Express/i }],
    },
  },
];

/**
 * Detect technologies from HTML and headers
 */
function detectTechnologies(
  html: string,
  headers: Record<string, string>,
  _url: string
): DetectedTechnology[] {
  const detected: DetectedTechnology[] = [];
  const seenTechs = new Set<string>();

  for (const sig of TECH_SIGNATURES) {
    let confidence: 'high' | 'medium' | 'low' = 'low';
    let matchCount = 0;
    let evidence = '';
    let version: string | undefined;

    // Check HTML patterns
    if (sig.patterns.html) {
      for (const pattern of sig.patterns.html) {
        if (pattern.test(html)) {
          matchCount++;
          evidence = `HTML pattern: ${pattern.source}`;
        }
      }
    }

    // Check script sources
    if (sig.patterns.scripts) {
      for (const pattern of sig.patterns.scripts) {
        if (pattern.test(html)) {
          matchCount++;
          evidence = `Script: ${pattern.source}`;
        }
      }
    }

    // Check meta tags
    if (sig.patterns.meta) {
      for (const meta of sig.patterns.meta) {
        const metaRegex = meta.name
          ? new RegExp(`<meta[^>]*name=["']${meta.name}["'][^>]*content=["']([^"']+)["']`, 'i')
          : null;
        if (metaRegex) {
          const match = html.match(metaRegex);
          if (match && (!meta.content || meta.content.test(match[1]))) {
            matchCount++;
            evidence = `Meta tag: ${meta.name}`;
            // Try to extract version from meta
            if (sig.versionPatterns) {
              for (const vp of sig.versionPatterns) {
                const vMatch = match[1].match(vp);
                if (vMatch) {
                  version = vMatch[1];
                }
              }
            }
          }
        }
      }
    }

    // Check headers
    if (sig.patterns.headers) {
      for (const header of sig.patterns.headers) {
        const headerValue = headers[header.name.toLowerCase()];
        if (headerValue) {
          if (!header.pattern || header.pattern.test(headerValue)) {
            matchCount++;
            evidence = `Header: ${header.name}`;
            // Try to extract version from header
            if (sig.versionPatterns) {
              for (const vp of sig.versionPatterns) {
                const vMatch = headerValue.match(vp);
                if (vMatch) {
                  version = vMatch[1];
                }
              }
            }
          }
        }
      }
    }

    // Determine confidence based on matches
    if (matchCount >= 3) {
      confidence = 'high';
    } else if (matchCount >= 2) {
      confidence = 'medium';
    } else if (matchCount === 1) {
      confidence = 'low';
    }

    if (matchCount > 0 && !seenTechs.has(sig.name)) {
      seenTechs.add(sig.name);
      detected.push({
        name: sig.name,
        category: sig.category,
        confidence,
        version,
        evidence,
      });
    }
  }

  // Sort by confidence
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  detected.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

  return detected;
}

/**
 * util_tech_detection tool
 */
export const techDetectionTool = defineTool<TechDetectionInput, TechDetectionOutput>({
  name: 'util_tech_detection',
  description: 'Detect technologies used by a website including CMS, frameworks, analytics, CDN, web servers, and programming languages. Returns detected technologies with confidence levels.',
  category: 'utilities' as ToolCategory,
  inputSchema: TechDetectionInputSchema,
  cacheTTL: 3600, // 1 hour
  cacheKeyFn: (input) => input.url,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const { $, headers } = await fetchHtml(url);
    const html = $.html();

    const technologies = detectTechnologies(html, headers, url);

    // Group by category
    const categories: { [category: string]: string[] } = {};
    for (const tech of technologies) {
      if (!categories[tech.category]) {
        categories[tech.category] = [];
      }
      categories[tech.category].push(tech.version ? `${tech.name} ${tech.version}` : tech.name);
    }

    return {
      url,
      technologies,
      categories,
      timestamp: new Date().toISOString(),
    };
  },
});
