/**
 * Google tools module
 *
 * Unified exports for all Google API tools: GTM, GA4, Search Console, Ads, and Indexing.
 */

// GTM
export * from './gtm/index.js';
export { registerGTMTools, gtmTools } from './gtm/index.js';

// Analytics
export * from './analytics/index.js';
export { registerGA4Tools, ga4Tools } from './analytics/index.js';

// Search Console
export * from './search-console/index.js';
export { registerGSCTools, gscTools } from './search-console/index.js';

// Ads
export * from './ads/index.js';
export { registerAdsTools, adsTools } from './ads/index.js';

// Indexing API
export * from './indexing/index.js';
export { registerIndexingTools, indexingTools } from './indexing/index.js';

// Business Profile
export * from './business-profile/index.js';
export { registerGBPTools, gbpTools } from './business-profile/index.js';

import { registerGTMTools, gtmTools } from './gtm/index.js';
import { registerGA4Tools, ga4Tools } from './analytics/index.js';
import { registerGSCTools, gscTools } from './search-console/index.js';
import { registerAdsTools, adsTools } from './ads/index.js';
import { registerIndexingTools, indexingTools } from './indexing/index.js';
import { registerGBPTools, gbpTools } from './business-profile/index.js';
import type { ToolDefinition } from '../../types/tools.js';

/** All Google tools combined */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const googleTools: ToolDefinition<any, any>[] = [
  ...gtmTools,
  ...ga4Tools,
  ...gscTools,
  ...adsTools,
  ...indexingTools,
  ...gbpTools,
];

/** Register all Google tools */
export function registerGoogleTools(): void {
  registerGTMTools();
  registerGA4Tools();
  registerGSCTools();
  registerAdsTools();
  registerIndexingTools();
  registerGBPTools();
}
