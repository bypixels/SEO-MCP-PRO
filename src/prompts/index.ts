/**
 * MCP Prompts
 *
 * Pre-built prompts for common analysis tasks.
 */

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments: PromptArgument[];
}

/** Available prompts */
export const prompts: MCPPrompt[] = [
  {
    name: 'seo-analysis',
    description: 'Comprehensive SEO analysis for a website',
    arguments: [
      {
        name: 'url',
        description: 'Website URL to analyze',
        required: true,
      },
    ],
  },
  {
    name: 'performance-review',
    description: 'Performance review with Core Web Vitals analysis',
    arguments: [
      {
        name: 'url',
        description: 'Website URL to analyze',
        required: true,
      },
      {
        name: 'compare_period',
        description: 'Previous period to compare',
        required: false,
      },
    ],
  },
  {
    name: 'security-audit',
    description: 'Security audit covering SSL, headers, and threats',
    arguments: [
      {
        name: 'url',
        description: 'Website URL to audit',
        required: true,
      },
    ],
  },
  {
    name: 'gtm-setup-guide',
    description: 'Guide for setting up Google Tag Manager',
    arguments: [
      {
        name: 'tracking_needs',
        description: 'What you need to track',
        required: true,
      },
    ],
  },
  {
    name: 'analytics-insights',
    description: 'Get insights from Google Analytics data',
    arguments: [
      {
        name: 'property_id',
        description: 'GA4 Property ID',
        required: true,
      },
      {
        name: 'question',
        description: 'What you want to know',
        required: true,
      },
    ],
  },
];

/**
 * Get prompt by name
 */
export function getPrompt(name: string): MCPPrompt | undefined {
  return prompts.find((p) => p.name === name);
}
