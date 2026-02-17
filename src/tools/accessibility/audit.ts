/**
 * Accessibility Audit tools
 */

import { z } from 'zod';
import axios from 'axios';
// cheerio import removed - using Lighthouse via PSI API
import { createServiceLogger } from '../../utils/logger.js';
import { MCPError } from '../../types/errors.js';
import type { ToolDefinition } from '../../types/tools.js';
import { ToolCategory } from '../../types/tools.js';

const log = createServiceLogger('a11y-audit');

// ============================================
// A11y Audit
// ============================================

const a11yAuditSchema = z.object({
  url: z.string().url().describe('URL to audit'),
  standard: z.enum(['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .optional()
    .describe('WCAG standard to test against'),
  includeHidden: z.boolean().optional().describe('Include hidden elements'),
});

type A11yAuditInput = z.infer<typeof a11yAuditSchema>;

interface A11yViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  nodes: {
    html: string;
    target: string[];
    failureSummary: string;
  }[];
  wcagTags: string[];
}

interface A11yAuditOutput {
  url: string;
  timestamp: string;
  standard: string;
  score: number;
  violations: A11yViolation[];
  passes: number;
  incomplete: {
    id: string;
    description: string;
    nodes: { html: string; target: string[] }[];
  }[];
  summary: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
}

export const a11yAuditTool: ToolDefinition<A11yAuditInput, A11yAuditOutput> = {
  name: 'a11y_audit',
  description: 'Runs an accessibility audit on a webpage using Lighthouse accessibility checks',
  category: ToolCategory.ACCESSIBILITY,
  inputSchema: a11yAuditSchema,

  async handler(input: A11yAuditInput): Promise<A11yAuditOutput> {
    log.info('Running accessibility audit', { url: input.url, standard: input.standard });

    const standard = input.standard || 'wcag21aa';
    const violations: A11yViolation[] = [];
    const incomplete: A11yAuditOutput['incomplete'] = [];
    let passes = 0;

    // Use Lighthouse via PageSpeed Insights API for accessibility audit
    try {
      const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
      let psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(input.url)}&strategy=MOBILE&category=ACCESSIBILITY`;
      if (apiKey) psiUrl += `&key=${apiKey}`;

      const response = await axios.get(psiUrl, { timeout: 120000 });
      const data = response.data;

      const audits = data.lighthouseResult?.audits || {};
      const accessibilityScore = Math.round((data.lighthouseResult?.categories?.accessibility?.score || 0) * 100);

      // Map Lighthouse audits to our violation format
      const auditMappings: Record<string, { id: string; wcag: string[]; description: string; help: string }> = {
        'button-name': {
          id: 'button-name',
          wcag: ['wcag2a', 'wcag412'],
          description: 'Buttons must have discernible text',
          help: 'Add accessible text to buttons',
        },
        'color-contrast': {
          id: 'color-contrast',
          wcag: ['wcag2aa', 'wcag143'],
          description: 'Elements must have sufficient color contrast',
          help: 'Ensure text has adequate color contrast ratio',
        },
        'document-title': {
          id: 'document-title',
          wcag: ['wcag2a', 'wcag242'],
          description: 'Document should have a title element',
          help: 'Add a <title> element to the page',
        },
        'html-has-lang': {
          id: 'html-has-lang',
          wcag: ['wcag2a', 'wcag311'],
          description: 'HTML element should have a lang attribute',
          help: 'Add lang attribute to <html> element',
        },
        'image-alt': {
          id: 'image-alt',
          wcag: ['wcag2a', 'wcag111'],
          description: 'Images must have alternate text',
          help: 'Add alt attribute to images',
        },
        'label': {
          id: 'label',
          wcag: ['wcag2a', 'wcag412'],
          description: 'Form elements must have labels',
          help: 'Associate labels with form elements',
        },
        'link-name': {
          id: 'link-name',
          wcag: ['wcag2a', 'wcag412'],
          description: 'Links must have discernible text',
          help: 'Add accessible text to links',
        },
        'meta-viewport': {
          id: 'meta-viewport',
          wcag: ['wcag2aa', 'wcag144'],
          description: 'Page should not disable zoom',
          help: 'Remove maximum-scale or user-scalable restrictions',
        },
        'heading-order': {
          id: 'heading-order',
          wcag: ['wcag2a', 'wcag131'],
          description: 'Heading levels should only increase by one',
          help: 'Use headings in proper sequential order',
        },
        'list': {
          id: 'list',
          wcag: ['wcag2a', 'wcag131'],
          description: 'Lists must be structured correctly',
          help: 'Use proper list markup',
        },
        'tabindex': {
          id: 'tabindex',
          wcag: ['wcag2a', 'wcag241'],
          description: 'tabindex should not be greater than zero',
          help: 'Remove positive tabindex values',
        },
        'aria-allowed-attr': {
          id: 'aria-allowed-attr',
          wcag: ['wcag2a', 'wcag412'],
          description: 'ARIA attributes must be valid for the element\'s role',
          help: 'Use correct ARIA attributes',
        },
        'aria-required-attr': {
          id: 'aria-required-attr',
          wcag: ['wcag2a', 'wcag412'],
          description: 'Required ARIA attributes must be provided',
          help: 'Add required ARIA attributes',
        },
        'aria-valid-attr': {
          id: 'aria-valid-attr',
          wcag: ['wcag2a', 'wcag412'],
          description: 'ARIA attributes must be valid',
          help: 'Fix invalid ARIA attributes',
        },
        'bypass': {
          id: 'bypass',
          wcag: ['wcag2a', 'wcag241'],
          description: 'Page should have means to bypass repeated content',
          help: 'Add skip links or landmarks',
        },
      };

      for (const [auditId, mapping] of Object.entries(auditMappings)) {
        const audit = audits[auditId];
        if (audit) {
          if (audit.score === 1 || audit.score === null) {
            passes++;
          } else if (audit.score === 0) {
            // Determine impact based on WCAG level
            let impact: 'critical' | 'serious' | 'moderate' | 'minor' = 'moderate';
            if (mapping.wcag.some(w => w.includes('wcag2a'))) impact = 'serious';
            if (auditId === 'color-contrast' || auditId === 'image-alt') impact = 'serious';
            if (auditId === 'html-has-lang' || auditId === 'document-title') impact = 'critical';

            const nodes: A11yViolation['nodes'] = [];
            if (audit.details?.items) {
              for (const item of audit.details.items.slice(0, 5)) {
                nodes.push({
                  html: item.node?.snippet || item.selector || '',
                  target: [item.node?.selector || item.selector || ''],
                  failureSummary: item.node?.explanation || audit.description || '',
                });
              }
            }

            violations.push({
              id: mapping.id,
              impact,
              description: mapping.description,
              help: mapping.help,
              helpUrl: `https://dequeuniversity.com/rules/axe/4.4/${mapping.id}`,
              nodes,
              wcagTags: mapping.wcag,
            });
          }
        }
      }

      const summary = {
        critical: violations.filter(v => v.impact === 'critical').length,
        serious: violations.filter(v => v.impact === 'serious').length,
        moderate: violations.filter(v => v.impact === 'moderate').length,
        minor: violations.filter(v => v.impact === 'minor').length,
      };

      const result: A11yAuditOutput = {
        url: input.url,
        timestamp: new Date().toISOString(),
        standard,
        score: accessibilityScore,
        violations,
        passes,
        incomplete,
        summary,
      };

      log.info('Accessibility audit completed', {
        url: input.url,
        score: accessibilityScore,
        violations: violations.length,
      });

      return result;

    } catch (err) {
      log.error('Accessibility audit failed', { error: err instanceof Error ? err : new Error(String(err)) });
      throw MCPError.externalServiceError('accessibility', `Accessibility audit failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  },
};
