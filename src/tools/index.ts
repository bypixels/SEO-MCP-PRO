/**
 * Tool registry and exports
 *
 * This file will export all tools organized by category.
 * Each tool module should register its tools here.
 */

import { ToolDefinition, ToolRegistry } from '../types/tools.js';
import { isPro } from '../licensing/index.js';
import { isProTool } from '../licensing/tiers.js';

/** Global tool registry */
export const toolRegistry: ToolRegistry = new Map();

/**
 * Register a tool
 */
export function registerTool<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolRegistry.set(tool.name, tool as ToolDefinition<any, any>);
}

/**
 * Get a tool by name (respects license tier)
 */
export function getTool(name: string): ToolDefinition | undefined {
  const tool = toolRegistry.get(name);
  if (!tool) return undefined;

  if (isProTool(name) && !isPro()) {
    return undefined;
  }

  return tool;
}

/**
 * Check if a tool is blocked by license tier.
 * Returns true if the tool exists but requires Pro.
 */
export function isToolProGated(name: string): boolean {
  return toolRegistry.has(name) && isProTool(name) && !isPro();
}

/**
 * Get all tools (filtered by license tier)
 */
export function getAllTools(): ToolDefinition[] {
  const tools = Array.from(toolRegistry.values());
  if (isPro()) return tools;
  return tools.filter((t) => !isProTool(t.name));
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): ToolDefinition[] {
  return getAllTools().filter((tool) => tool.category === category);
}

/**
 * Check if a tool exists
 */
export function hasTool(name: string): boolean {
  return toolRegistry.has(name);
}

// Import tool registration functions
import { registerMonitoringTools, monitoringTools } from './monitoring/index.js';
import { registerSecurityTools, securityTools } from './security/index.js';
import { registerSeoTechnicalTools, seoTechnicalTools } from './seo-technical/index.js';
import { registerUtilityTools, utilityTools } from './utilities/index.js';
import { registerGoogleTools, googleTools } from './google/index.js';
import { registerPerformanceTools, performanceTools } from './performance/index.js';
import { registerReportsTools, reportsTools } from './reports/index.js';
import { registerAccessibilityTools, accessibilityTools } from './accessibility/index.js';
import { registerCloudflareTools, cloudflareTools } from './integrations/cloudflare/index.js';

/**
 * Register all available tools
 */
export function registerAllTools(): void {
  registerMonitoringTools();
  registerSecurityTools();
  registerSeoTechnicalTools();
  registerUtilityTools();
  registerGoogleTools();
  registerPerformanceTools();
  registerReportsTools();
  registerAccessibilityTools();
  registerCloudflareTools();
}

// Export tool arrays for direct access
export {
  monitoringTools,
  securityTools,
  seoTechnicalTools,
  utilityTools,
  googleTools,
  performanceTools,
  reportsTools,
  accessibilityTools,
  cloudflareTools,
};

// Re-export tool modules
export * from './monitoring/index.js';
export * from './security/index.js';
export * from './seo-technical/index.js';
export * from './utilities/index.js';
export * from './google/index.js';
export * from './performance/index.js';
export * from './reports/index.js';
export * from './accessibility/index.js';
export * from './integrations/cloudflare/index.js';
