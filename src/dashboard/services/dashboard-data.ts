/**
 * Dashboard data orchestration layer
 *
 * Calls tool handlers directly via the registry, bypassing MCP protocol.
 */

import { getTool, getAllTools } from '../../tools/index.js';
import { MCPError, ErrorCode } from '../../types/errors.js';
import type { DashboardOverviewOutput } from '../../types/dashboard.js';

/**
 * Get unified dashboard data for a URL
 */
export async function getDashboardData(url: string): Promise<DashboardOverviewOutput> {
  const tool = getTool('dashboard_overview');
  if (!tool) {
    throw new MCPError({
      code: ErrorCode.NOT_IMPLEMENTED,
      message: 'dashboard_overview tool not registered',
      retryable: false,
    });
  }

  return tool.handler({ url }) as Promise<DashboardOverviewOutput>;
}

/**
 * Get a specific report by type
 */
export async function getReportData(
  type: 'site-health' | 'seo-audit' | 'executive-summary',
  params: Record<string, unknown>,
): Promise<unknown> {
  const toolNames: Record<string, string> = {
    'site-health': 'report_site_health',
    'seo-audit': 'report_seo_audit',
    'executive-summary': 'report_executive_summary',
  };

  const toolName = toolNames[type];
  if (!toolName) {
    throw new MCPError({
      code: ErrorCode.INVALID_PARAMS,
      message: `Unknown report type: ${type}`,
      retryable: false,
    });
  }

  const tool = getTool(toolName);
  if (!tool) {
    throw new MCPError({
      code: ErrorCode.NOT_IMPLEMENTED,
      message: `Tool ${toolName} not registered`,
      retryable: false,
    });
  }

  const parsed = tool.inputSchema.safeParse(params);
  if (!parsed.success) {
    throw new MCPError({
      code: ErrorCode.INVALID_PARAMS,
      message: `Invalid parameters: ${parsed.error.message}`,
      retryable: false,
    });
  }

  return tool.handler(parsed.data);
}

/**
 * Execute any tool by name with Zod validation
 */
export async function executeToolByName(
  name: string,
  input: unknown,
): Promise<unknown> {
  const tool = getTool(name);
  if (!tool) {
    throw new MCPError({
      code: ErrorCode.NOT_IMPLEMENTED,
      message: `Tool not found: ${name}`,
      retryable: false,
    });
  }

  const parsed = tool.inputSchema.safeParse(input || {});
  if (!parsed.success) {
    throw new MCPError({
      code: ErrorCode.INVALID_PARAMS,
      message: `Invalid parameters: ${parsed.error.message}`,
      retryable: false,
    });
  }

  return tool.handler(parsed.data);
}

/**
 * List all available tools with metadata
 */
export function listTools(): { name: string; description: string; category: string }[] {
  return getAllTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    category: tool.category,
  }));
}
