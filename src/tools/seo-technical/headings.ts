/**
 * Heading structure analysis tool
 *
 * Analyzes the heading hierarchy (H1-H6) on a page for SEO best practices.
 */

import { z } from 'zod';
import { defineTool, fetchHtml, validateUrlInput } from '../base.js';
import { ToolCategory } from '../../types/tools.js';

// ============================================
// Heading Analysis
// ============================================

const headingAnalysisSchema = z.object({
  url: z.string().describe('URL to analyze'),
});

type HeadingAnalysisInput = z.infer<typeof headingAnalysisSchema>;

interface Heading {
  level: number;
  text: string;
  element: string;
  issues: string[];
}

interface HeadingAnalysisOutput {
  url: string;
  headings: Heading[];
  structure: {
    h1Count: number;
    h2Count: number;
    h3Count: number;
    h4Count: number;
    h5Count: number;
    h6Count: number;
    totalHeadings: number;
    hierarchy: string;
    hasProperHierarchy: boolean;
    issues: string[];
  };
  h1Analysis: {
    text?: string;
    length: number;
    issues: string[];
  };
  recommendations: string[];
  score: number;
  timestamp: string;
}

export const headingAnalysisTool = defineTool<HeadingAnalysisInput, HeadingAnalysisOutput>({
  name: 'seo_heading_analysis',
  description: 'Analyzes heading structure (H1-H6) for SEO best practices including hierarchy, H1 usage, and accessibility',
  category: 'seo' as ToolCategory,
  inputSchema: headingAnalysisSchema,
  cacheTTL: 1800, // 30 minutes
  cacheKeyFn: (input) => input.url,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const { $ } = await fetchHtml(url);

    const headings: Heading[] = [];
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Count headings by level
    const counts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

    // Extract all headings in document order
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const $el = $(el);
      const tagName = el.tagName.toLowerCase();
      const level = parseInt(tagName.charAt(1), 10);
      const text = $el.text().trim();
      const headingIssues: string[] = [];

      // Count by level
      counts[tagName as keyof typeof counts]++;

      // Check for empty headings
      if (!text) {
        headingIssues.push('Empty heading');
        score -= 5;
      }

      // Check for very long headings
      if (text.length > 200) {
        headingIssues.push(`Very long (${text.length} chars)`);
        score -= 2;
      }

      // Check for headings that might be used for styling only
      if (text.length < 3 && text !== '') {
        headingIssues.push('Very short - might be misused for styling');
      }

      headings.push({
        level,
        text: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
        element: tagName,
        issues: headingIssues,
      });
    });

    // Build visual hierarchy
    const hierarchyLines: string[] = [];
    for (const h of headings) {
      const indent = '  '.repeat(h.level - 1);
      const prefix = `H${h.level}:`;
      const displayText = h.text.substring(0, 60) + (h.text.length > 60 ? '...' : '');
      hierarchyLines.push(`${indent}${prefix} ${displayText || '(empty)'}`);
    }
    const hierarchy = hierarchyLines.join('\n');

    // Analyze H1
    const h1Elements = $('h1');
    const h1Analysis: HeadingAnalysisOutput['h1Analysis'] = {
      text: undefined,
      length: 0,
      issues: [],
    };

    if (counts.h1 === 0) {
      h1Analysis.issues.push('Missing H1 heading');
      issues.push('No H1 heading found');
      recommendations.push('Add a single H1 heading that describes the main topic of the page');
      score -= 20;
    } else if (counts.h1 === 1) {
      const h1Text = h1Elements.first().text().trim();
      h1Analysis.text = h1Text;
      h1Analysis.length = h1Text.length;

      if (!h1Text) {
        h1Analysis.issues.push('H1 is empty');
        issues.push('H1 heading is empty');
        score -= 15;
      } else {
        if (h1Text.length < 20) {
          h1Analysis.issues.push('H1 may be too short');
          recommendations.push('Consider making the H1 more descriptive');
          score -= 3;
        }
        if (h1Text.length > 70) {
          h1Analysis.issues.push('H1 may be too long');
          recommendations.push('Consider shortening the H1 to under 70 characters');
          score -= 3;
        }
      }
    } else {
      h1Analysis.issues.push(`Multiple H1 headings found (${counts.h1})`);
      issues.push(`Multiple H1 headings found: ${counts.h1}`);
      recommendations.push('Use only one H1 heading per page');
      score -= 10;
    }

    // Check heading hierarchy
    let hasProperHierarchy = true;
    let previousLevel = 0;

    for (const h of headings) {
      // First heading should ideally be H1
      if (previousLevel === 0 && h.level > 1) {
        issues.push(`First heading is H${h.level}, not H1`);
        hasProperHierarchy = false;
        score -= 5;
      }

      // Check for skipped levels (e.g., H1 -> H3)
      if (previousLevel > 0 && h.level > previousLevel + 1) {
        issues.push(`Heading level skipped: H${previousLevel} to H${h.level}`);
        hasProperHierarchy = false;
        score -= 3;
      }

      previousLevel = h.level;
    }

    if (!hasProperHierarchy) {
      recommendations.push('Maintain a proper heading hierarchy without skipping levels');
    }

    // Check for very deep nesting
    if (counts.h5 > 0 || counts.h6 > 0) {
      recommendations.push('Deep heading levels (H5/H6) found - consider simplifying content structure');
    }

    // Check for heading distribution
    if (counts.h2 === 0 && headings.length > 1) {
      issues.push('No H2 headings found despite having other headings');
      recommendations.push('Add H2 headings to create clear content sections');
      score -= 5;
    }

    // Check for empty heading
    const emptyHeadings = headings.filter(h => !h.text);
    if (emptyHeadings.length > 0) {
      issues.push(`${emptyHeadings.length} empty heading(s) found`);
      recommendations.push('Remove or fill in empty headings');
    }

    // Check total heading count for content ratio
    if (headings.length === 0) {
      issues.push('No headings found on the page');
      recommendations.push('Add headings to structure your content');
      score -= 15;
    } else if (headings.length === 1 && counts.h1 === 1) {
      recommendations.push('Consider adding subheadings (H2, H3) to break up content');
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));

    return {
      url,
      headings,
      structure: {
        h1Count: counts.h1,
        h2Count: counts.h2,
        h3Count: counts.h3,
        h4Count: counts.h4,
        h5Count: counts.h5,
        h6Count: counts.h6,
        totalHeadings: headings.length,
        hierarchy,
        hasProperHierarchy,
        issues,
      },
      h1Analysis,
      recommendations,
      score,
      timestamp: new Date().toISOString(),
    };
  },
});
