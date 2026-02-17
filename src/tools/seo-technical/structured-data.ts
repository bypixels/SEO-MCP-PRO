/**
 * Structured data (JSON-LD, Schema.org) analysis tools
 */

import { z } from 'zod';
import type { CheerioAPI } from 'cheerio';
import { defineTool, fetchHtml, validateUrlInput } from '../base.js';
import { ToolCategory } from '../../types/tools.js';

/** Structured data analysis input schema */
const StructuredDataInputSchema = z.object({
  url: z.string().describe('URL to analyze'),
});

type StructuredDataInput = z.infer<typeof StructuredDataInputSchema>;

interface SchemaItem {
  type: string;
  format: 'json-ld' | 'microdata' | 'rdfa';
  raw: string;
  parsed?: Record<string, unknown>;
  errors?: string[];
}

interface StructuredDataOutput {
  url: string;
  found: boolean;
  totalItems: number;
  formats: {
    jsonLd: number;
    microdata: number;
    rdfa: number;
  };
  schemas: SchemaItem[];
  types: string[];
  issues: {
    severity: 'error' | 'warning' | 'info';
    message: string;
  }[];
  recommendations: string[];
  timestamp: string;
}

// Common schema types and their recommended properties
const SCHEMA_RECOMMENDATIONS: Record<string, string[]> = {
  'Organization': ['name', 'url', 'logo', 'contactPoint'],
  'LocalBusiness': ['name', 'address', 'telephone', 'openingHours', 'priceRange'],
  'Product': ['name', 'image', 'description', 'offers', 'aggregateRating'],
  'Article': ['headline', 'author', 'datePublished', 'image', 'publisher'],
  'BlogPosting': ['headline', 'author', 'datePublished', 'image', 'publisher'],
  'NewsArticle': ['headline', 'author', 'datePublished', 'image', 'publisher'],
  'WebPage': ['name', 'description', 'breadcrumb'],
  'FAQPage': ['mainEntity'],
  'HowTo': ['name', 'step', 'totalTime'],
  'Recipe': ['name', 'image', 'author', 'prepTime', 'cookTime', 'recipeIngredient', 'recipeInstructions'],
  'Event': ['name', 'startDate', 'location', 'offers'],
  'Person': ['name', 'jobTitle', 'worksFor'],
  'BreadcrumbList': ['itemListElement'],
  'WebSite': ['url', 'potentialAction'],
};

/**
 * Extract and validate JSON-LD scripts
 */
function extractJsonLd($: CheerioAPI): SchemaItem[] {
  const items: SchemaItem[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html() || '';
    try {
      const parsed = JSON.parse(raw);
      const type = extractType(parsed);

      items.push({
        type,
        format: 'json-ld',
        raw,
        parsed,
      });
    } catch (error) {
      items.push({
        type: 'Unknown',
        format: 'json-ld',
        raw,
        errors: [`Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`],
      });
    }
  });

  return items;
}

/**
 * Extract schema type from parsed data
 */
function extractType(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Unknown';

  if (Array.isArray(data)) {
    const types = data.map(extractType).filter(t => t !== 'Unknown');
    return types.length > 0 ? types.join(', ') : 'Unknown';
  }

  const obj = data as Record<string, unknown>;
  if (obj['@type']) {
    if (Array.isArray(obj['@type'])) {
      return obj['@type'].join(', ');
    }
    return String(obj['@type']);
  }

  if (obj['@graph'] && Array.isArray(obj['@graph'])) {
    const types = obj['@graph'].map(extractType).filter(t => t !== 'Unknown');
    return types.length > 0 ? types.join(', ') : 'Unknown';
  }

  return 'Unknown';
}

/**
 * Extract microdata from HTML
 */
function extractMicrodata($: CheerioAPI): SchemaItem[] {
  const items: SchemaItem[] = [];

  $('[itemscope]').each((_, el) => {
    const $el = $(el);
    const itemtype = $el.attr('itemtype') || '';
    const type = itemtype.split('/').pop() || 'Unknown';

    // Collect all itemprop values
    const properties: Record<string, string[]> = {};
    $el.find('[itemprop]').each((__, prop) => {
      const $prop = $(prop);
      const propName = $prop.attr('itemprop') || '';
      const propValue = $prop.attr('content') || $prop.text().trim();
      if (propName) {
        if (!properties[propName]) {
          properties[propName] = [];
        }
        properties[propName].push(propValue);
      }
    });

    items.push({
      type,
      format: 'microdata',
      raw: $.html(el),
      parsed: { '@type': type, ...properties },
    });
  });

  return items;
}

/**
 * Extract RDFa from HTML (basic support)
 */
function extractRdfa($: CheerioAPI): SchemaItem[] {
  const items: SchemaItem[] = [];

  $('[typeof]').each((_, el) => {
    const $el = $(el);
    const type = $el.attr('typeof') || 'Unknown';

    items.push({
      type,
      format: 'rdfa',
      raw: $.html(el),
    });
  });

  return items;
}

/**
 * Validate schema item against recommendations
 */
function validateSchema(item: SchemaItem): string[] {
  const issues: string[] = [];

  if (!item.parsed || item.errors?.length) {
    return issues;
  }

  const type = item.type.split(',')[0].trim();
  const recommended = SCHEMA_RECOMMENDATIONS[type];

  if (recommended && item.parsed) {
    const missing = recommended.filter(prop => {
      const value = (item.parsed as Record<string, unknown>)[prop];
      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      issues.push(`Missing recommended properties for ${type}: ${missing.join(', ')}`);
    }
  }

  return issues;
}

/**
 * seo_structured_data tool
 */
export const structuredDataTool = defineTool<StructuredDataInput, StructuredDataOutput>({
  name: 'seo_structured_data',
  description: 'Analyze structured data (JSON-LD, Microdata, RDFa). Extracts schema.org types, validates format, and provides recommendations for improving rich results.',
  category: 'seo' as ToolCategory,
  inputSchema: StructuredDataInputSchema,
  cacheTTL: 1800, // 30 minutes
  cacheKeyFn: (input) => input.url,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const { $ } = await fetchHtml(url);

    const issues: StructuredDataOutput['issues'] = [];
    const recommendations: string[] = [];

    // Extract all structured data
    const jsonLdItems = extractJsonLd($);
    const microdataItems = extractMicrodata($);
    const rdfaItems = extractRdfa($);

    const allItems = [...jsonLdItems, ...microdataItems, ...rdfaItems];

    // Collect unique types
    const types = [...new Set(allItems.map(item => item.type).filter(t => t !== 'Unknown'))];

    // Check for invalid JSON-LD
    const invalidJsonLd = jsonLdItems.filter(item => item.errors?.length);
    if (invalidJsonLd.length > 0) {
      for (const item of invalidJsonLd) {
        issues.push({
          severity: 'error',
          message: `Invalid JSON-LD: ${item.errors?.join(', ')}`,
        });
      }
    }

    // Validate each schema item
    for (const item of allItems) {
      const schemaIssues = validateSchema(item);
      for (const issue of schemaIssues) {
        issues.push({ severity: 'warning', message: issue });
      }
    }

    // General recommendations
    if (allItems.length === 0) {
      issues.push({
        severity: 'warning',
        message: 'No structured data found on page',
      });
      recommendations.push('Add JSON-LD structured data to improve search visibility');
      recommendations.push('Consider adding Organization, WebSite, or BreadcrumbList schemas');
    } else {
      // Check for common missing schemas
      if (!types.some(t => t.includes('Organization') || t.includes('LocalBusiness'))) {
        recommendations.push('Consider adding Organization schema for brand information');
      }
      if (!types.some(t => t.includes('BreadcrumbList'))) {
        recommendations.push('Consider adding BreadcrumbList schema for navigation');
      }
      if (!types.some(t => t.includes('WebSite'))) {
        recommendations.push('Consider adding WebSite schema with SearchAction for sitelinks search box');
      }
    }

    // Check for multiple formats (not recommended)
    const formatsUsed = new Set(allItems.map(item => item.format));
    if (formatsUsed.size > 1) {
      issues.push({
        severity: 'info',
        message: `Multiple structured data formats detected: ${[...formatsUsed].join(', ')}. JSON-LD is recommended.`,
      });
    }

    // Microdata deprecation note
    if (microdataItems.length > 0) {
      recommendations.push('Consider migrating from Microdata to JSON-LD for easier maintenance');
    }

    return {
      url,
      found: allItems.length > 0,
      totalItems: allItems.length,
      formats: {
        jsonLd: jsonLdItems.length,
        microdata: microdataItems.length,
        rdfa: rdfaItems.length,
      },
      schemas: allItems,
      types,
      issues,
      recommendations,
      timestamp: new Date().toISOString(),
    };
  },
});
