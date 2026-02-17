# Website Operations MCP - Technical Specification

## Project Overview

### Vision
Develop a comprehensive Model Context Protocol (MCP) server that enables Claude to operate, analyze, manage, and investigate the complete Google marketing and website operations ecosystem. This MCP serves as a unified interface for website performance, marketing analytics, SEO, advertising, and technical health monitoring.

### Target Name
`website-ops-mcp`

### Core Objectives
1. Centralized authentication for all Google services
2. Unified tool interface for website operations
3. Multi-site support for agency/consultant workflows
4. Real-time analysis and reporting capabilities
5. Proactive monitoring and alerting
6. Cross-platform data correlation and insights

---

## Technology Stack

### Runtime & Framework
- **Runtime**: Node.js 20+ (LTS)
- **Language**: TypeScript 5.x (strict mode)
- **MCP SDK**: @modelcontextprotocol/sdk
- **Build**: tsup or esbuild
- **Package Manager**: pnpm

### Key Dependencies
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "googleapis": "^130.0.0",
    "google-auth-library": "^9.x",
    "google-ads-api": "^17.x",
    "zod": "^3.x",
    "axios": "^1.x",
    "cheerio": "^1.x",
    "lighthouse": "^12.x",
    "axe-core": "^4.x",
    "dotenv": "^16.x",
    "winston": "^3.x",
    "bottleneck": "^2.x"
  }
}
```

---

## Architecture

### Directory Structure
```
website-ops-mcp/
├── src/
│   ├── index.ts                      # MCP server entry point
│   ├── server.ts                     # Server configuration
│   ├── types/
│   │   ├── index.ts                  # Shared types
│   │   ├── google.ts                 # Google API types
│   │   ├── tools.ts                  # Tool definitions
│   │   └── config.ts                 # Configuration types
│   ├── auth/
│   │   ├── index.ts                  # Auth exports
│   │   ├── google-oauth.ts           # OAuth 2.0 implementation
│   │   ├── service-account.ts        # Service account handler
│   │   ├── token-manager.ts          # Token refresh & caching
│   │   └── api-keys.ts               # API key management
│   ├── tools/
│   │   ├── index.ts                  # Tool registry
│   │   ├── google/
│   │   │   ├── gtm/
│   │   │   │   ├── index.ts
│   │   │   │   ├── containers.ts
│   │   │   │   ├── tags.ts
│   │   │   │   ├── triggers.ts
│   │   │   │   ├── variables.ts
│   │   │   │   └── versions.ts
│   │   │   ├── analytics/
│   │   │   │   ├── index.ts
│   │   │   │   ├── reports.ts
│   │   │   │   ├── realtime.ts
│   │   │   │   ├── properties.ts
│   │   │   │   ├── audiences.ts
│   │   │   │   └── events.ts
│   │   │   ├── search-console/
│   │   │   │   ├── index.ts
│   │   │   │   ├── performance.ts
│   │   │   │   ├── indexing.ts
│   │   │   │   ├── sitemaps.ts
│   │   │   │   └── inspection.ts
│   │   │   ├── ads/
│   │   │   │   ├── index.ts
│   │   │   │   ├── campaigns.ts
│   │   │   │   ├── ad-groups.ts
│   │   │   │   ├── keywords.ts
│   │   │   │   ├── reports.ts
│   │   │   │   └── budgets.ts
│   │   │   ├── business-profile/
│   │   │   │   ├── index.ts
│   │   │   │   ├── locations.ts
│   │   │   │   ├── reviews.ts
│   │   │   │   ├── posts.ts
│   │   │   │   ├── insights.ts
│   │   │   │   └── media.ts
│   │   │   ├── pagespeed/
│   │   │   │   ├── index.ts
│   │   │   │   └── insights.ts
│   │   │   └── indexing/
│   │   │       ├── index.ts
│   │   │       └── api.ts
│   │   ├── performance/
│   │   │   ├── index.ts
│   │   │   ├── core-web-vitals.ts
│   │   │   ├── crux.ts
│   │   │   └── lighthouse.ts
│   │   ├── security/
│   │   │   ├── index.ts
│   │   │   ├── safe-browsing.ts
│   │   │   ├── ssl-analysis.ts
│   │   │   ├── headers.ts
│   │   │   └── vulnerabilities.ts
│   │   ├── seo-technical/
│   │   │   ├── index.ts
│   │   │   ├── structured-data.ts
│   │   │   ├── robots.ts
│   │   │   ├── sitemap.ts
│   │   │   ├── redirects.ts
│   │   │   ├── canonicals.ts
│   │   │   └── meta-tags.ts
│   │   ├── accessibility/
│   │   │   ├── index.ts
│   │   │   ├── wcag-audit.ts
│   │   │   └── contrast.ts
│   │   ├── monitoring/
│   │   │   ├── index.ts
│   │   │   ├── uptime.ts
│   │   │   ├── dns.ts
│   │   │   ├── certificates.ts
│   │   │   └── response-time.ts
│   │   ├── integrations/
│   │   │   ├── cloudflare/
│   │   │   │   ├── index.ts
│   │   │   │   ├── analytics.ts
│   │   │   │   ├── dns.ts
│   │   │   │   ├── cache.ts
│   │   │   │   └── firewall.ts
│   │   │   └── seo-platforms/
│   │   │       ├── index.ts
│   │   │       └── backlinks.ts
│   │   ├── utilities/
│   │   │   ├── index.ts
│   │   │   ├── screenshots.ts
│   │   │   ├── tech-detection.ts
│   │   │   ├── broken-links.ts
│   │   │   ├── headers-analysis.ts
│   │   │   └── whois.ts
│   │   └── reports/
│   │       ├── index.ts
│   │       ├── site-health.ts
│   │       ├── seo-audit.ts
│   │       └── executive-summary.ts
│   ├── resources/
│   │   ├── index.ts
│   │   ├── site-config.ts
│   │   └── credentials-status.ts
│   ├── prompts/
│   │   ├── index.ts
│   │   ├── seo-analysis.ts
│   │   ├── performance-review.ts
│   │   └── security-audit.ts
│   ├── utils/
│   │   ├── rate-limiter.ts
│   │   ├── cache.ts
│   │   ├── logger.ts
│   │   ├── validators.ts
│   │   └── formatters.ts
│   └── config/
│       ├── index.ts
│       ├── google-scopes.ts
│       └── defaults.ts
├── config/
│   ├── sites.example.json
│   └── credentials.example.json
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   ├── setup.md
│   ├── authentication.md
│   └── tools-reference.md
├── .env.example
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

---

## Authentication System

### Google OAuth 2.0 Configuration

#### Required Scopes by Service
```typescript
const GOOGLE_SCOPES = {
  // Google Tag Manager
  gtm: [
    'https://www.googleapis.com/auth/tagmanager.readonly',
    'https://www.googleapis.com/auth/tagmanager.edit.containers',
    'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
    'https://www.googleapis.com/auth/tagmanager.publish',
    'https://www.googleapis.com/auth/tagmanager.manage.users',
  ],
  
  // Google Analytics 4
  analytics: [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/analytics.edit',
    'https://www.googleapis.com/auth/analytics.manage.users',
  ],
  
  // Google Search Console
  searchConsole: [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/webmasters',
  ],
  
  // Google Ads
  ads: [
    'https://www.googleapis.com/auth/adwords',
  ],
  
  // Google Business Profile
  businessProfile: [
    'https://www.googleapis.com/auth/business.manage',
  ],
  
  // Indexing API
  indexing: [
    'https://www.googleapis.com/auth/indexing',
  ],
};
```

#### Token Manager Implementation
```typescript
interface TokenManager {
  // Get valid access token (auto-refresh if expired)
  getAccessToken(service: GoogleService): Promise<string>;
  
  // Force token refresh
  refreshToken(service: GoogleService): Promise<void>;
  
  // Check token validity
  isTokenValid(service: GoogleService): boolean;
  
  // Revoke all tokens
  revokeAll(): Promise<void>;
}
```

#### Service Account vs OAuth Flow
```typescript
interface AuthConfig {
  // Service Account (recommended for server-to-server)
  serviceAccount?: {
    keyFile: string;          // Path to JSON key file
    impersonateUser?: string; // For domain-wide delegation
  };
  
  // OAuth 2.0 (for user-specific access)
  oauth?: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    refreshToken?: string;
  };
}
```

---

## Tool Specifications

### Naming Convention
All tools follow the pattern: `{module}_{action}_{target}`

Examples:
- `gtm_list_containers`
- `ga4_run_report`
- `gsc_get_performance`
- `ads_create_campaign`

---

## Module 1: Google Tag Manager (GTM)

### Tools

#### gtm_list_accounts
Lists all GTM accounts accessible to the authenticated user.
```typescript
interface GTMListAccountsInput {
  pageSize?: number;        // Max 200
  pageToken?: string;
}

interface GTMListAccountsOutput {
  accounts: GTMAccount[];
  nextPageToken?: string;
}
```

#### gtm_list_containers
Lists containers within a GTM account.
```typescript
interface GTMListContainersInput {
  accountId: string;
  pageSize?: number;
  pageToken?: string;
}
```

#### gtm_get_container
Gets detailed information about a specific container.
```typescript
interface GTMGetContainerInput {
  accountId: string;
  containerId: string;
}
```

#### gtm_list_workspaces
Lists all workspaces in a container.
```typescript
interface GTMListWorkspacesInput {
  accountId: string;
  containerId: string;
}
```

#### gtm_list_tags
Lists all tags in a workspace.
```typescript
interface GTMListTagsInput {
  accountId: string;
  containerId: string;
  workspaceId: string;
}

interface GTMTag {
  tagId: string;
  name: string;
  type: string;
  firingTriggerId: string[];
  blockingTriggerId?: string[];
  parameter: GTMParameter[];
  fingerprint: string;
  parentFolderId?: string;
  paused?: boolean;
}
```

#### gtm_get_tag
Gets a specific tag's configuration.
```typescript
interface GTMGetTagInput {
  accountId: string;
  containerId: string;
  workspaceId: string;
  tagId: string;
}
```

#### gtm_create_tag
Creates a new tag in a workspace.
```typescript
interface GTMCreateTagInput {
  accountId: string;
  containerId: string;
  workspaceId: string;
  tag: {
    name: string;
    type: string;                    // e.g., 'gaawe', 'html', 'img'
    parameter: GTMParameter[];
    firingTriggerId: string[];
    blockingTriggerId?: string[];
    paused?: boolean;
  };
}
```

#### gtm_update_tag
Updates an existing tag.
```typescript
interface GTMUpdateTagInput {
  accountId: string;
  containerId: string;
  workspaceId: string;
  tagId: string;
  tag: Partial<GTMTag>;
  fingerprint: string;              // Required for optimistic locking
}
```

#### gtm_delete_tag
Deletes a tag from a workspace.
```typescript
interface GTMDeleteTagInput {
  accountId: string;
  containerId: string;
  workspaceId: string;
  tagId: string;
}
```

#### gtm_list_triggers
Lists all triggers in a workspace.
```typescript
interface GTMListTriggersInput {
  accountId: string;
  containerId: string;
  workspaceId: string;
}

interface GTMTrigger {
  triggerId: string;
  name: string;
  type: string;                     // e.g., 'pageview', 'click', 'customEvent'
  filter?: GTMCondition[];
  autoEventFilter?: GTMCondition[];
  customEventFilter?: GTMCondition[];
  fingerprint: string;
}
```

#### gtm_create_trigger
Creates a new trigger.
```typescript
interface GTMCreateTriggerInput {
  accountId: string;
  containerId: string;
  workspaceId: string;
  trigger: {
    name: string;
    type: string;
    filter?: GTMCondition[];
    customEventFilter?: GTMCondition[];
  };
}
```

#### gtm_list_variables
Lists all variables in a workspace.
```typescript
interface GTMListVariablesInput {
  accountId: string;
  containerId: string;
  workspaceId: string;
}

interface GTMVariable {
  variableId: string;
  name: string;
  type: string;                     // e.g., 'v', 'jsm', 'c'
  parameter: GTMParameter[];
  fingerprint: string;
}
```

#### gtm_create_variable
Creates a new variable.
```typescript
interface GTMCreateVariableInput {
  accountId: string;
  containerId: string;
  workspaceId: string;
  variable: {
    name: string;
    type: string;
    parameter: GTMParameter[];
  };
}
```

#### gtm_list_versions
Lists all container versions.
```typescript
interface GTMListVersionsInput {
  accountId: string;
  containerId: string;
  includeDeleted?: boolean;
}

interface GTMVersion {
  accountId: string;
  containerId: string;
  containerVersionId: string;
  name: string;
  description?: string;
  fingerprint: string;
}
```

#### gtm_create_version
Creates a new container version from a workspace.
```typescript
interface GTMCreateVersionInput {
  accountId: string;
  containerId: string;
  workspaceId: string;
  name: string;
  notes?: string;
}
```

#### gtm_publish_version
Publishes a container version.
```typescript
interface GTMPublishVersionInput {
  accountId: string;
  containerId: string;
  containerVersionId: string;
  fingerprint?: string;
}
```

#### gtm_audit_container
Custom tool: Audits a container for best practices and issues.
```typescript
interface GTMAuditContainerInput {
  accountId: string;
  containerId: string;
  workspaceId: string;
}

interface GTMAuditResult {
  summary: {
    totalTags: number;
    totalTriggers: number;
    totalVariables: number;
    issues: number;
    warnings: number;
  };
  issues: GTMAuditIssue[];
  recommendations: string[];
}

interface GTMAuditIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  element: {
    type: 'tag' | 'trigger' | 'variable';
    id: string;
    name: string;
  };
}
```

---

## Module 2: Google Analytics 4 (GA4)

### Tools

#### ga4_list_accounts
Lists all GA4 accounts.
```typescript
interface GA4ListAccountsInput {
  pageSize?: number;
  pageToken?: string;
}
```

#### ga4_list_properties
Lists all properties for an account.
```typescript
interface GA4ListPropertiesInput {
  accountId?: string;              // Filter by account
  pageSize?: number;
  pageToken?: string;
}

interface GA4Property {
  name: string;                    // Format: properties/{propertyId}
  displayName: string;
  propertyType: string;
  createTime: string;
  updateTime: string;
  industryCategory?: string;
  timeZone: string;
  currencyCode: string;
}
```

#### ga4_get_property
Gets property details.
```typescript
interface GA4GetPropertyInput {
  propertyId: string;
}
```

#### ga4_run_report
Runs a custom report query.
```typescript
interface GA4RunReportInput {
  propertyId: string;
  dateRanges: {
    startDate: string;            // YYYY-MM-DD or 'today', 'yesterday', 'NdaysAgo'
    endDate: string;
    name?: string;
  }[];
  dimensions?: {
    name: string;                 // e.g., 'city', 'deviceCategory', 'pagePath'
  }[];
  metrics: {
    name: string;                 // e.g., 'activeUsers', 'sessions', 'screenPageViews'
  }[];
  dimensionFilter?: GA4FilterExpression;
  metricFilter?: GA4FilterExpression;
  orderBys?: GA4OrderBy[];
  limit?: number;                 // Max 100000
  offset?: number;
  keepEmptyRows?: boolean;
}

interface GA4ReportOutput {
  dimensionHeaders: { name: string }[];
  metricHeaders: { name: string; type: string }[];
  rows: {
    dimensionValues: { value: string }[];
    metricValues: { value: string }[];
  }[];
  rowCount: number;
  metadata: {
    currencyCode: string;
    timeZone: string;
  };
}
```

#### ga4_run_realtime_report
Gets real-time data.
```typescript
interface GA4RunRealtimeReportInput {
  propertyId: string;
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  dimensionFilter?: GA4FilterExpression;
  metricFilter?: GA4FilterExpression;
  limit?: number;
}
```

#### ga4_get_metadata
Gets available dimensions and metrics for a property.
```typescript
interface GA4GetMetadataInput {
  propertyId: string;
}

interface GA4Metadata {
  dimensions: {
    apiName: string;
    uiName: string;
    description: string;
    category: string;
  }[];
  metrics: {
    apiName: string;
    uiName: string;
    description: string;
    type: string;
    category: string;
  }[];
}
```

#### ga4_list_audiences
Lists configured audiences.
```typescript
interface GA4ListAudiencesInput {
  propertyId: string;
  pageSize?: number;
  pageToken?: string;
}
```

#### ga4_list_conversions
Lists conversion events.
```typescript
interface GA4ListConversionsInput {
  propertyId: string;
  pageSize?: number;
  pageToken?: string;
}
```

#### ga4_list_custom_dimensions
Lists custom dimensions.
```typescript
interface GA4ListCustomDimensionsInput {
  propertyId: string;
  pageSize?: number;
  pageToken?: string;
}
```

#### ga4_list_custom_metrics
Lists custom metrics.
```typescript
interface GA4ListCustomMetricsInput {
  propertyId: string;
  pageSize?: number;
  pageToken?: string;
}
```

#### ga4_run_funnel_report
Runs a funnel analysis report.
```typescript
interface GA4RunFunnelReportInput {
  propertyId: string;
  dateRanges: { startDate: string; endDate: string }[];
  funnel: {
    isOpenFunnel?: boolean;
    steps: {
      name: string;
      filterExpression: GA4FilterExpression;
    }[];
  };
  funnelBreakdown?: {
    breakdownDimension: { name: string };
  };
  limit?: number;
}
```

#### ga4_traffic_overview
Custom tool: Gets a comprehensive traffic overview.
```typescript
interface GA4TrafficOverviewInput {
  propertyId: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  compareTo?: 'previousPeriod' | 'previousYear';
}

interface GA4TrafficOverviewOutput {
  summary: {
    users: number;
    newUsers: number;
    sessions: number;
    bounceRate: number;
    avgSessionDuration: number;
    pageviews: number;
  };
  comparison?: {
    usersChange: number;
    sessionsChange: number;
    // ... percentage changes
  };
  topSources: { source: string; users: number; sessions: number }[];
  topPages: { page: string; views: number; avgTimeOnPage: number }[];
  deviceBreakdown: { device: string; users: number; percentage: number }[];
  geoBreakdown: { country: string; users: number; percentage: number }[];
}
```

---

## Module 3: Google Search Console (GSC)

### Tools

#### gsc_list_sites
Lists all sites in Search Console.
```typescript
interface GSCListSitesOutput {
  siteEntry: {
    siteUrl: string;
    permissionLevel: string;
  }[];
}
```

#### gsc_get_site
Gets information about a specific site.
```typescript
interface GSCGetSiteInput {
  siteUrl: string;
}
```

#### gsc_query_performance
Queries search performance data.
```typescript
interface GSCQueryPerformanceInput {
  siteUrl: string;
  startDate: string;                // YYYY-MM-DD
  endDate: string;
  dimensions?: ('query' | 'page' | 'country' | 'device' | 'searchAppearance' | 'date')[];
  dimensionFilterGroups?: {
    groupType?: 'and';
    filters: {
      dimension: string;
      operator: 'equals' | 'contains' | 'notContains' | 'includingRegex' | 'excludingRegex';
      expression: string;
    }[];
  }[];
  aggregationType?: 'auto' | 'byProperty' | 'byPage';
  rowLimit?: number;                // Max 25000
  startRow?: number;
  dataState?: 'all' | 'final';
  type?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews';
}

interface GSCPerformanceRow {
  keys: string[];                   // Dimension values
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GSCQueryPerformanceOutput {
  rows: GSCPerformanceRow[];
  responseAggregationType: string;
}
```

#### gsc_inspect_url
Inspects a URL's index status.
```typescript
interface GSCInspectUrlInput {
  siteUrl: string;
  inspectionUrl: string;
  languageCode?: string;
}

interface GSCInspectUrlOutput {
  inspectionResult: {
    inspectionResultLink: string;
    indexStatusResult: {
      verdict: string;              // 'PASS', 'NEUTRAL', 'FAIL'
      coverageState: string;
      robotsTxtState: string;
      indexingState: string;
      lastCrawlTime?: string;
      pageFetchState: string;
      googleCanonical?: string;
      userCanonical?: string;
      crawledAs: string;
    };
    mobileUsabilityResult?: {
      verdict: string;
      issues?: { issueType: string; message: string }[];
    };
    richResultsResult?: {
      verdict: string;
      detectedItems?: { richResultType: string }[];
    };
  };
}
```

#### gsc_list_sitemaps
Lists sitemaps for a site.
```typescript
interface GSCListSitemapsInput {
  siteUrl: string;
}

interface GSCSitemap {
  path: string;
  lastSubmitted: string;
  isPending: boolean;
  isSitemapsIndex: boolean;
  lastDownloaded?: string;
  warnings?: number;
  errors?: number;
  contents?: {
    type: string;
    submitted?: number;
    indexed?: number;
  }[];
}
```

#### gsc_submit_sitemap
Submits a sitemap for crawling.
```typescript
interface GSCSubmitSitemapInput {
  siteUrl: string;
  feedpath: string;               // Full URL of sitemap
}
```

#### gsc_delete_sitemap
Removes a sitemap.
```typescript
interface GSCDeleteSitemapInput {
  siteUrl: string;
  feedpath: string;
}
```

#### gsc_top_queries
Custom tool: Gets top search queries with insights.
```typescript
interface GSCTopQueriesInput {
  siteUrl: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  limit?: number;
  filters?: {
    page?: string;
    country?: string;
    device?: 'MOBILE' | 'DESKTOP' | 'TABLET';
  };
}

interface GSCTopQueriesOutput {
  queries: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    trend: 'up' | 'down' | 'stable';
    changePercent?: number;
  }[];
  summary: {
    totalClicks: number;
    totalImpressions: number;
    avgCtr: number;
    avgPosition: number;
  };
}
```

#### gsc_coverage_report
Custom tool: Gets index coverage summary.
```typescript
interface GSCCoverageReportInput {
  siteUrl: string;
}

interface GSCCoverageReportOutput {
  summary: {
    valid: number;
    validWithWarnings: number;
    error: number;
    excluded: number;
  };
  issues: {
    type: string;
    severity: 'error' | 'warning' | 'excluded';
    count: number;
    examples: string[];
  }[];
}
```

---

## Module 4: Google Ads

### Tools

#### ads_list_customers
Lists accessible customer accounts.
```typescript
interface AdsListCustomersOutput {
  customers: {
    resourceName: string;
    id: string;
    descriptiveName: string;
    currencyCode: string;
    timeZone: string;
    manager: boolean;
  }[];
}
```

#### ads_get_customer
Gets customer account details.
```typescript
interface AdsGetCustomerInput {
  customerId: string;
}
```

#### ads_list_campaigns
Lists campaigns for a customer.
```typescript
interface AdsListCampaignsInput {
  customerId: string;
  status?: 'ENABLED' | 'PAUSED' | 'REMOVED';
  type?: 'SEARCH' | 'DISPLAY' | 'SHOPPING' | 'VIDEO' | 'PERFORMANCE_MAX';
}

interface AdsCampaign {
  resourceName: string;
  id: string;
  name: string;
  status: string;
  advertisingChannelType: string;
  startDate: string;
  endDate?: string;
  biddingStrategy?: string;
}
```

#### ads_get_campaign
Gets campaign details.
```typescript
interface AdsGetCampaignInput {
  customerId: string;
  campaignId: string;
}
```

#### ads_create_campaign
Creates a new campaign.
```typescript
interface AdsCreateCampaignInput {
  customerId: string;
  campaign: {
    name: string;
    advertisingChannelType: string;
    status: 'ENABLED' | 'PAUSED';
    startDate: string;
    endDate?: string;
    campaignBudget: string;        // Budget resource name
    biddingStrategyType: string;
    targetCpa?: { targetCpaMicros: number };
    targetRoas?: { targetRoas: number };
    manualCpc?: { enhancedCpcEnabled: boolean };
  };
}
```

#### ads_update_campaign
Updates campaign settings.
```typescript
interface AdsUpdateCampaignInput {
  customerId: string;
  campaignId: string;
  operations: {
    status?: 'ENABLED' | 'PAUSED';
    name?: string;
    endDate?: string;
  };
}
```

#### ads_list_ad_groups
Lists ad groups in a campaign.
```typescript
interface AdsListAdGroupsInput {
  customerId: string;
  campaignId?: string;
  status?: 'ENABLED' | 'PAUSED' | 'REMOVED';
}
```

#### ads_list_keywords
Lists keywords in an ad group.
```typescript
interface AdsListKeywordsInput {
  customerId: string;
  adGroupId?: string;
  campaignId?: string;
  status?: 'ENABLED' | 'PAUSED' | 'REMOVED';
}

interface AdsKeyword {
  resourceName: string;
  criterionId: string;
  keyword: {
    text: string;
    matchType: 'EXACT' | 'PHRASE' | 'BROAD';
  };
  status: string;
  qualityInfo?: {
    qualityScore: number;
    creativityScore: string;
    postClickQualityScore: string;
    searchPredictedCtr: string;
  };
}
```

#### ads_add_keywords
Adds keywords to an ad group.
```typescript
interface AdsAddKeywordsInput {
  customerId: string;
  adGroupId: string;
  keywords: {
    text: string;
    matchType: 'EXACT' | 'PHRASE' | 'BROAD';
    status?: 'ENABLED' | 'PAUSED';
    cpcBidMicros?: number;
    finalUrl?: string;
  }[];
}
```

#### ads_get_keyword_ideas
Gets keyword suggestions.
```typescript
interface AdsGetKeywordIdeasInput {
  customerId: string;
  language: string;                // Language criterion ID
  geoTargetConstants: string[];    // Location criterion IDs
  keywordSeed?: {
    keywords: string[];
  };
  urlSeed?: {
    url: string;
  };
  pageSize?: number;
}

interface AdsKeywordIdea {
  text: string;
  keywordIdeaMetrics: {
    avgMonthlySearches: number;
    competition: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';
    competitionIndex: number;
    lowTopOfPageBidMicros: number;
    highTopOfPageBidMicros: number;
  };
}
```

#### ads_list_budgets
Lists campaign budgets.
```typescript
interface AdsListBudgetsInput {
  customerId: string;
}

interface AdsBudget {
  resourceName: string;
  id: string;
  name: string;
  amountMicros: number;
  deliveryMethod: string;
  status: string;
}
```

#### ads_create_budget
Creates a campaign budget.
```typescript
interface AdsCreateBudgetInput {
  customerId: string;
  budget: {
    name: string;
    amountMicros: number;           // Amount in micros (e.g., 1000000 = $1)
    deliveryMethod: 'STANDARD' | 'ACCELERATED';
    explicitlyShared?: boolean;
  };
}
```

#### ads_campaign_performance
Custom tool: Gets campaign performance metrics.
```typescript
interface AdsCampaignPerformanceInput {
  customerId: string;
  campaignId?: string;              // Optional: filter by campaign
  dateRange: {
    startDate: string;
    endDate: string;
  };
  metrics?: string[];               // Optional: specific metrics
}

interface AdsCampaignPerformanceOutput {
  campaigns: {
    campaignId: string;
    campaignName: string;
    status: string;
    metrics: {
      impressions: number;
      clicks: number;
      ctr: number;
      avgCpc: number;
      cost: number;
      conversions: number;
      conversionRate: number;
      costPerConversion: number;
    };
  }[];
  totals: {
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
  };
}
```

#### ads_search_term_report
Gets search terms report.
```typescript
interface AdsSearchTermReportInput {
  customerId: string;
  campaignId?: string;
  adGroupId?: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  minImpressions?: number;
}

interface AdsSearchTermReportOutput {
  searchTerms: {
    searchTerm: string;
    campaignName: string;
    adGroupName: string;
    matchType: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
  }[];
}
```

---

## Module 5: Google Business Profile

### Tools

#### gbp_list_accounts
Lists Business Profile accounts.
```typescript
interface GBPListAccountsOutput {
  accounts: {
    name: string;
    accountName: string;
    type: string;
    role: string;
    state: string;
  }[];
}
```

#### gbp_list_locations
Lists locations/businesses for an account.
```typescript
interface GBPListLocationsInput {
  accountId: string;
  pageSize?: number;
  pageToken?: string;
  filter?: string;
}

interface GBPLocation {
  name: string;
  title: string;
  storeCode?: string;
  websiteUri?: string;
  phoneNumbers?: {
    primaryPhone: string;
    additionalPhones?: string[];
  };
  categories?: {
    primaryCategory: { displayName: string };
    additionalCategories?: { displayName: string }[];
  };
  address: {
    regionCode: string;
    languageCode: string;
    postalCode: string;
    administrativeArea: string;
    locality: string;
    addressLines: string[];
  };
  latlng?: {
    latitude: number;
    longitude: number;
  };
}
```

#### gbp_get_location
Gets location details.
```typescript
interface GBPGetLocationInput {
  name: string;                     // Format: accounts/{accountId}/locations/{locationId}
  readMask?: string;
}
```

#### gbp_update_location
Updates location information.
```typescript
interface GBPUpdateLocationInput {
  name: string;
  location: Partial<GBPLocation>;
  updateMask: string;               // Fields to update
}
```

#### gbp_list_reviews
Lists reviews for a location.
```typescript
interface GBPListReviewsInput {
  parent: string;                   // Location name
  pageSize?: number;
  pageToken?: string;
  orderBy?: 'updateTime desc' | 'rating desc' | 'rating asc';
}

interface GBPReview {
  name: string;
  reviewId: string;
  reviewer: {
    profilePhotoUrl?: string;
    displayName: string;
  };
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: {
    comment: string;
    updateTime: string;
  };
}
```

#### gbp_reply_review
Replies to a review.
```typescript
interface GBPReplyReviewInput {
  name: string;                     // Review name
  comment: string;
}
```

#### gbp_delete_review_reply
Deletes a review reply.
```typescript
interface GBPDeleteReviewReplyInput {
  name: string;                     // Review name
}
```

#### gbp_list_posts
Lists posts for a location.
```typescript
interface GBPListPostsInput {
  parent: string;                   // Location name
  pageSize?: number;
  pageToken?: string;
}

interface GBPPost {
  name: string;
  languageCode: string;
  summary: string;
  callToAction?: {
    actionType: string;
    url?: string;
  };
  media?: {
    mediaFormat: string;
    sourceUrl: string;
  }[];
  topicType: 'STANDARD' | 'EVENT' | 'OFFER' | 'ALERT';
  createTime: string;
  updateTime: string;
  state: string;
}
```

#### gbp_create_post
Creates a new post.
```typescript
interface GBPCreatePostInput {
  parent: string;                   // Location name
  post: {
    languageCode: string;
    summary: string;
    topicType: 'STANDARD' | 'EVENT' | 'OFFER' | 'ALERT';
    callToAction?: {
      actionType: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL';
      url?: string;
    };
    event?: {
      title: string;
      schedule: {
        startDate: { year: number; month: number; day: number };
        endDate: { year: number; month: number; day: number };
        startTime?: { hours: number; minutes: number };
        endTime?: { hours: number; minutes: number };
      };
    };
    offer?: {
      couponCode?: string;
      redeemOnlineUrl?: string;
      termsConditions?: string;
    };
  };
}
```

#### gbp_get_insights
Gets performance insights for a location.
```typescript
interface GBPGetInsightsInput {
  name: string;                     // Location name
  basicRequest?: {
    metricRequests: {
      metric: 'QUERIES_DIRECT' | 'QUERIES_INDIRECT' | 'VIEWS_MAPS' | 'VIEWS_SEARCH' | 
              'ACTIONS_WEBSITE' | 'ACTIONS_PHONE' | 'ACTIONS_DRIVING_DIRECTIONS';
      options?: {
        times?: { startTime: string; endTime: string }[];
      };
    }[];
  };
}

interface GBPInsightsOutput {
  locationMetrics: {
    locationName: string;
    metricValues: {
      metric: string;
      totalValue?: {
        metricOption: string;
        timeDimension?: { timeRange: { startTime: string; endTime: string } };
        value: number;
      };
      dimensionalValues?: {
        metricOption: string;
        value: number;
        timeDimension?: { timeRange: { startTime: string; endTime: string } };
      }[];
    }[];
  }[];
}
```

#### gbp_list_media
Lists media items for a location.
```typescript
interface GBPListMediaInput {
  parent: string;                   // Location name
  pageSize?: number;
  pageToken?: string;
}
```

#### gbp_upload_media
Uploads media to a location.
```typescript
interface GBPUploadMediaInput {
  parent: string;                   // Location name
  mediaItem: {
    mediaFormat: 'PHOTO' | 'VIDEO';
    sourceUrl?: string;
    category?: 'COVER' | 'PROFILE' | 'LOGO' | 'EXTERIOR' | 'INTERIOR' | 
               'PRODUCT' | 'AT_WORK' | 'FOOD_AND_DRINK' | 'MENU' | 'COMMON_AREA' | 'TEAMS';
    description?: string;
  };
}
```

#### gbp_performance_report
Custom tool: Comprehensive performance report.
```typescript
interface GBPPerformanceReportInput {
  locationName: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

interface GBPPerformanceReportOutput {
  overview: {
    totalSearchViews: number;
    totalMapViews: number;
    totalWebsiteClicks: number;
    totalPhoneCalls: number;
    totalDirectionRequests: number;
  };
  searchBreakdown: {
    directSearches: number;
    discoverySearches: number;
    brandedSearches: number;
  };
  trends: {
    date: string;
    views: number;
    actions: number;
  }[];
  comparison?: {
    previousPeriod: typeof this['overview'];
    percentChanges: Record<string, number>;
  };
}
```

---

## Module 6: PageSpeed & Performance

### Tools

#### psi_analyze
Analyzes page performance with PageSpeed Insights.
```typescript
interface PSIAnalyzeInput {
  url: string;
  strategy: 'MOBILE' | 'DESKTOP';
  category?: ('ACCESSIBILITY' | 'BEST_PRACTICES' | 'PERFORMANCE' | 'PWA' | 'SEO')[];
  locale?: string;
}

interface PSIAnalyzeOutput {
  lighthouseResult: {
    finalUrl: string;
    requestedUrl: string;
    fetchTime: string;
    categories: {
      performance?: { score: number };
      accessibility?: { score: number };
      'best-practices'?: { score: number };
      seo?: { score: number };
      pwa?: { score: number };
    };
    audits: Record<string, {
      id: string;
      title: string;
      description: string;
      score: number | null;
      scoreDisplayMode: string;
      displayValue?: string;
      details?: unknown;
    }>;
  };
  loadingExperience?: {
    metrics: {
      CUMULATIVE_LAYOUT_SHIFT_SCORE?: FieldMetric;
      EXPERIMENTAL_TIME_TO_FIRST_BYTE?: FieldMetric;
      FIRST_CONTENTFUL_PAINT_MS?: FieldMetric;
      FIRST_INPUT_DELAY_MS?: FieldMetric;
      INTERACTION_TO_NEXT_PAINT?: FieldMetric;
      LARGEST_CONTENTFUL_PAINT_MS?: FieldMetric;
    };
    overall_category: 'FAST' | 'AVERAGE' | 'SLOW';
  };
  originLoadingExperience?: {
    // Same as loadingExperience but for origin
  };
}

interface FieldMetric {
  percentile: number;
  distributions: { min: number; max: number; proportion: number }[];
  category: 'FAST' | 'AVERAGE' | 'SLOW';
}
```

#### crux_query
Queries Chrome UX Report data.
```typescript
interface CrUXQueryInput {
  url?: string;                     // Specific URL
  origin?: string;                  // Origin-level data
  formFactor?: 'PHONE' | 'DESKTOP' | 'TABLET';
  metrics?: ('cumulative_layout_shift' | 'first_contentful_paint' | 
             'first_input_delay' | 'interaction_to_next_paint' | 
             'largest_contentful_paint' | 'experimental_time_to_first_byte')[];
}

interface CrUXQueryOutput {
  record: {
    key: {
      url?: string;
      origin?: string;
      formFactor?: string;
    };
    metrics: Record<string, {
      histogram: { start: number; end: number; density: number }[];
      percentiles: { p75: number };
    }>;
    collectionPeriod: {
      firstDate: { year: number; month: number; day: number };
      lastDate: { year: number; month: number; day: number };
    };
  };
}
```

#### crux_history
Gets historical CrUX data.
```typescript
interface CrUXHistoryInput {
  url?: string;
  origin?: string;
  formFactor?: 'PHONE' | 'DESKTOP' | 'TABLET';
  metrics?: string[];
}

interface CrUXHistoryOutput {
  record: {
    key: { url?: string; origin?: string; formFactor?: string };
    collectionPeriods: {
      firstDate: { year: number; month: number; day: number };
      lastDate: { year: number; month: number; day: number };
    }[];
    metrics: Record<string, {
      histogramTimeseries: {
        start: number;
        end: number;
        densities: number[];
      }[];
      percentilesTimeseries: {
        p75s: number[];
      };
    }>;
  };
}
```

#### lighthouse_audit
Runs a full Lighthouse audit programmatically.
```typescript
interface LighthouseAuditInput {
  url: string;
  formFactor: 'mobile' | 'desktop';
  categories?: ('performance' | 'accessibility' | 'best-practices' | 'seo' | 'pwa')[];
  throttling?: {
    cpuSlowdownMultiplier?: number;
    requestLatencyMs?: number;
    downloadThroughputKbps?: number;
    uploadThroughputKbps?: number;
  };
}

interface LighthouseAuditOutput {
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
    pwa?: number;
  };
  metrics: {
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    totalBlockingTime: number;
    cumulativeLayoutShift: number;
    speedIndex: number;
    timeToInteractive: number;
  };
  opportunities: {
    id: string;
    title: string;
    description: string;
    savings: {
      bytes?: number;
      ms?: number;
    };
  }[];
  diagnostics: {
    id: string;
    title: string;
    description: string;
    details?: unknown;
  }[];
}
```

#### cwv_report
Custom tool: Core Web Vitals summary report.
```typescript
interface CWVReportInput {
  url: string;
  includeHistory?: boolean;
}

interface CWVReportOutput {
  url: string;
  fetchedAt: string;
  mobile: {
    lcp: { value: number; rating: 'good' | 'needs-improvement' | 'poor' };
    fid: { value: number; rating: 'good' | 'needs-improvement' | 'poor' };
    cls: { value: number; rating: 'good' | 'needs-improvement' | 'poor' };
    inp: { value: number; rating: 'good' | 'needs-improvement' | 'poor' };
    ttfb: { value: number; rating: 'good' | 'needs-improvement' | 'poor' };
    overallStatus: 'passing' | 'failing';
  };
  desktop: {
    // Same structure
  };
  history?: {
    date: string;
    mobile: { lcp: number; fid: number; cls: number };
    desktop: { lcp: number; fid: number; cls: number };
  }[];
  recommendations: string[];
}
```

---

## Module 7: Indexing API

### Tools

#### indexing_publish
Notifies Google about a new or updated URL.
```typescript
interface IndexingPublishInput {
  url: string;
  type: 'URL_UPDATED' | 'URL_DELETED';
}

interface IndexingPublishOutput {
  urlNotificationMetadata: {
    url: string;
    latestUpdate?: {
      url: string;
      type: string;
      notifyTime: string;
    };
    latestRemove?: {
      url: string;
      type: string;
      notifyTime: string;
    };
  };
}
```

#### indexing_get_status
Gets the notification status for a URL.
```typescript
interface IndexingGetStatusInput {
  url: string;
}
```

#### indexing_batch_publish
Batch notification for multiple URLs.
```typescript
interface IndexingBatchPublishInput {
  notifications: {
    url: string;
    type: 'URL_UPDATED' | 'URL_DELETED';
  }[];
}

interface IndexingBatchPublishOutput {
  results: {
    url: string;
    success: boolean;
    error?: string;
  }[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}
```

---

## Module 8: Security

### Tools

#### security_safe_browsing
Checks URL against Google Safe Browsing.
```typescript
interface SafeBrowsingInput {
  urls: string[];
  threatTypes?: ('MALWARE' | 'SOCIAL_ENGINEERING' | 'UNWANTED_SOFTWARE' | 'POTENTIALLY_HARMFUL_APPLICATION')[];
  platformTypes?: ('ANY_PLATFORM' | 'WINDOWS' | 'LINUX' | 'OSX' | 'ANDROID' | 'IOS')[];
}

interface SafeBrowsingOutput {
  matches?: {
    threatType: string;
    platformType: string;
    threat: { url: string };
    cacheDuration: string;
  }[];
  safe: boolean;
}
```

#### security_ssl_analyze
Analyzes SSL/TLS configuration.
```typescript
interface SSLAnalyzeInput {
  host: string;
  publish?: 'on' | 'off';
  startNew?: 'on' | 'off';
  fromCache?: 'on' | 'off';
  maxAge?: number;
}

interface SSLAnalyzeOutput {
  host: string;
  port: number;
  protocol: string;
  isPublic: boolean;
  status: string;
  startTime: number;
  testTime: number;
  engineVersion: string;
  criteriaVersion: string;
  endpoints: {
    ipAddress: string;
    serverName: string;
    statusMessage: string;
    grade: string;
    gradeTrustIgnored: string;
    hasWarnings: boolean;
    isExceptional: boolean;
    progress: number;
    duration: number;
    delegation: number;
    details?: {
      protocols: { id: number; name: string; version: string }[];
      suites: { id: number; name: string; cipherStrength: number }[];
      certChains: {
        trustPaths: { certIds: number[]; trust: string }[];
        issues: number;
      }[];
    };
  }[];
  certHostnames?: string[];
}
```

#### security_headers_check
Checks security headers.
```typescript
interface SecurityHeadersCheckInput {
  url: string;
  followRedirects?: boolean;
}

interface SecurityHeadersCheckOutput {
  url: string;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  headers: {
    present: {
      name: string;
      value: string;
      status: 'good' | 'warning' | 'info';
    }[];
    missing: {
      name: string;
      description: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
    }[];
  };
  recommendations: string[];
}
```

#### security_audit
Custom tool: Comprehensive security audit.
```typescript
interface SecurityAuditInput {
  url: string;
}

interface SecurityAuditOutput {
  url: string;
  timestamp: string;
  overallScore: number;
  safeBrowsing: {
    status: 'clean' | 'flagged';
    threats: string[];
  };
  ssl: {
    grade: string;
    validUntil: string;
    issuer: string;
    protocol: string;
    issues: string[];
  };
  headers: {
    grade: string;
    present: string[];
    missing: string[];
  };
  recommendations: {
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    issue: string;
    fix: string;
  }[];
}
```

---

## Module 9: SEO Technical

### Tools

#### seo_validate_structured_data
Validates structured data on a page.
```typescript
interface ValidateStructuredDataInput {
  url?: string;
  content?: string;                 // Raw HTML/JSON-LD
}

interface ValidateStructuredDataOutput {
  valid: boolean;
  items: {
    type: string;
    errors: { property: string; message: string }[];
    warnings: { property: string; message: string }[];
    data: Record<string, unknown>;
  }[];
  summary: {
    totalItems: number;
    errors: number;
    warnings: number;
  };
}
```

#### seo_analyze_robots
Analyzes robots.txt.
```typescript
interface AnalyzeRobotsInput {
  url: string;                      // Full URL to robots.txt or site
}

interface AnalyzeRobotsOutput {
  url: string;
  exists: boolean;
  content?: string;
  rules: {
    userAgent: string;
    allow: string[];
    disallow: string[];
    crawlDelay?: number;
  }[];
  sitemaps: string[];
  issues: {
    severity: 'error' | 'warning' | 'info';
    message: string;
    line?: number;
  }[];
  testResults?: {
    url: string;
    userAgent: string;
    allowed: boolean;
  }[];
}
```

#### seo_validate_sitemap
Validates an XML sitemap.
```typescript
interface ValidateSitemapInput {
  url: string;                      // Sitemap URL
  validateUrls?: boolean;           // Check if URLs are accessible
  maxUrlsToCheck?: number;
}

interface ValidateSitemapOutput {
  url: string;
  valid: boolean;
  type: 'urlset' | 'sitemapindex';
  urlCount: number;
  sitemaps?: string[];              // For sitemap index
  issues: {
    severity: 'error' | 'warning';
    message: string;
    url?: string;
  }[];
  urlAnalysis?: {
    total: number;
    accessible: number;
    redirected: number;
    broken: number;
    samples: {
      url: string;
      status: number;
      lastmod?: string;
      changefreq?: string;
      priority?: number;
    }[];
  };
}
```

#### seo_check_redirects
Checks redirect chains.
```typescript
interface CheckRedirectsInput {
  urls: string[];
  maxHops?: number;
}

interface CheckRedirectsOutput {
  results: {
    originalUrl: string;
    finalUrl: string;
    hops: number;
    chain: {
      url: string;
      status: number;
      type?: '301' | '302' | '303' | '307' | '308' | 'meta' | 'js';
    }[];
    issues: string[];
  }[];
  summary: {
    total: number;
    withRedirects: number;
    longChains: number;
    loops: number;
  };
}
```

#### seo_analyze_meta_tags
Analyzes meta tags on a page.
```typescript
interface AnalyzeMetaTagsInput {
  url: string;
}

interface AnalyzeMetaTagsOutput {
  url: string;
  title: {
    content: string;
    length: number;
    issues: string[];
  };
  description: {
    content: string;
    length: number;
    issues: string[];
  };
  canonical: {
    href: string;
    isSelf: boolean;
    issues: string[];
  };
  robots: {
    content: string;
    index: boolean;
    follow: boolean;
    issues: string[];
  };
  openGraph: {
    present: boolean;
    tags: Record<string, string>;
    issues: string[];
  };
  twitter: {
    present: boolean;
    tags: Record<string, string>;
    issues: string[];
  };
  hreflang: {
    tags: { lang: string; href: string }[];
    issues: string[];
  };
  score: number;
  recommendations: string[];
}
```

#### seo_check_canonicals
Checks canonical tag implementation.
```typescript
interface CheckCanonicalsInput {
  urls: string[];
}

interface CheckCanonicalsOutput {
  results: {
    url: string;
    canonical: string | null;
    status: 'self' | 'different' | 'missing' | 'multiple' | 'invalid';
    issues: string[];
  }[];
  summary: {
    total: number;
    selfReferencing: number;
    crossDomain: number;
    missing: number;
    issues: number;
  };
}
```

#### seo_heading_analysis
Analyzes heading structure.
```typescript
interface HeadingAnalysisInput {
  url: string;
}

interface HeadingAnalysisOutput {
  url: string;
  headings: {
    level: number;
    text: string;
    issues: string[];
  }[];
  structure: {
    h1Count: number;
    hierarchy: string;             // Visual representation
    issues: string[];
  };
  recommendations: string[];
}
```

---

## Module 10: Accessibility

### Tools

#### a11y_audit
Runs accessibility audit using axe-core.
```typescript
interface A11yAuditInput {
  url: string;
  standard?: 'wcag2a' | 'wcag2aa' | 'wcag2aaa' | 'wcag21a' | 'wcag21aa' | 'wcag22aa';
  includeHidden?: boolean;
}

interface A11yAuditOutput {
  url: string;
  timestamp: string;
  standard: string;
  score: number;
  violations: {
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
  }[];
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
```

#### a11y_check_contrast
Checks color contrast ratios.
```typescript
interface CheckContrastInput {
  url?: string;
  foreground?: string;              // Hex color
  background?: string;              // Hex color
  fontSize?: number;
  isBold?: boolean;
}

interface CheckContrastOutput {
  ratio: number;
  aa: {
    normalText: 'pass' | 'fail';
    largeText: 'pass' | 'fail';
  };
  aaa: {
    normalText: 'pass' | 'fail';
    largeText: 'pass' | 'fail';
  };
  // If URL provided
  pageAnalysis?: {
    totalElements: number;
    passing: number;
    failing: {
      element: string;
      foreground: string;
      background: string;
      ratio: number;
      required: number;
    }[];
  };
}
```

#### a11y_check_images
Checks images for alt text.
```typescript
interface CheckImagesInput {
  url: string;
}

interface CheckImagesOutput {
  url: string;
  images: {
    src: string;
    alt: string | null;
    role: string | null;
    decorative: boolean;
    status: 'good' | 'missing' | 'empty' | 'suspicious';
    issue?: string;
  }[];
  summary: {
    total: number;
    withAlt: number;
    decorative: number;
    missing: number;
    empty: number;
    suspicious: number;
  };
}
```

---

## Module 11: Monitoring

### Tools

#### monitor_check_uptime
Checks if a URL is accessible.
```typescript
interface CheckUptimeInput {
  url: string;
  method?: 'GET' | 'HEAD';
  timeout?: number;
  expectedStatus?: number[];
  checkContent?: string;            // String to find in response
}

interface CheckUptimeOutput {
  url: string;
  status: 'up' | 'down' | 'degraded';
  statusCode: number;
  responseTime: number;             // ms
  headers: Record<string, string>;
  ssl?: {
    valid: boolean;
    expiresIn: number;              // days
    issuer: string;
  };
  contentCheck?: {
    found: boolean;
    snippet?: string;
  };
  timestamp: string;
}
```

#### monitor_dns_lookup
Performs DNS lookup.
```typescript
interface DNSLookupInput {
  domain: string;
  recordTypes?: ('A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'SOA')[];
}

interface DNSLookupOutput {
  domain: string;
  records: {
    type: string;
    value: string;
    ttl: number;
    priority?: number;              // For MX
  }[];
  nameservers: string[];
  timestamp: string;
}
```

#### monitor_dns_propagation
Checks DNS propagation across servers.
```typescript
interface DNSPropagationInput {
  domain: string;
  recordType: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT';
  expectedValue?: string;
}

interface DNSPropagationOutput {
  domain: string;
  recordType: string;
  expectedValue?: string;
  servers: {
    name: string;
    location: string;
    value: string | null;
    matches: boolean;
    responseTime: number;
  }[];
  propagationPercent: number;
  fullyPropagated: boolean;
}
```

#### monitor_certificate
Checks SSL certificate details.
```typescript
interface CertificateCheckInput {
  hostname: string;
  port?: number;
}

interface CertificateCheckOutput {
  hostname: string;
  valid: boolean;
  issuer: {
    commonName: string;
    organization: string;
  };
  subject: {
    commonName: string;
    alternativeNames: string[];
  };
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  protocol: string;
  fingerprint: string;
  chain: {
    subject: string;
    issuer: string;
    validTo: string;
  }[];
  issues: string[];
}
```

#### monitor_response_time
Measures response time from multiple locations.
```typescript
interface ResponseTimeInput {
  url: string;
  locations?: string[];             // If supported
  samples?: number;
}

interface ResponseTimeOutput {
  url: string;
  measurements: {
    location?: string;
    dns: number;
    connect: number;
    ttfb: number;
    download: number;
    total: number;
  }[];
  average: {
    dns: number;
    connect: number;
    ttfb: number;
    download: number;
    total: number;
  };
  fastest: number;
  slowest: number;
}
```

---

## Module 12: Integrations

### Cloudflare

#### cf_get_zones
Lists Cloudflare zones.
```typescript
interface CFGetZonesInput {
  name?: string;                    // Filter by name
  status?: 'active' | 'pending' | 'initializing' | 'moved' | 'deleted' | 'deactivated';
}

interface CFZone {
  id: string;
  name: string;
  status: string;
  paused: boolean;
  type: string;
  nameServers: string[];
  originalNameServers: string[];
  createdOn: string;
  modifiedOn: string;
}
```

#### cf_get_analytics
Gets Cloudflare analytics.
```typescript
interface CFGetAnalyticsInput {
  zoneId: string;
  since: string;                    // ISO datetime or relative
  until?: string;
}

interface CFAnalyticsOutput {
  totals: {
    requests: {
      all: number;
      cached: number;
      uncached: number;
      ssl: { encrypted: number; unencrypted: number };
    };
    bandwidth: {
      all: number;
      cached: number;
      uncached: number;
    };
    threats: {
      all: number;
      types: Record<string, number>;
    };
    pageviews: {
      all: number;
      searchEngines: Record<string, number>;
    };
    uniques: {
      all: number;
    };
  };
  timeseries: {
    since: string;
    until: string;
    requests: { all: number; cached: number };
    bandwidth: { all: number };
    threats: { all: number };
    pageviews: { all: number };
    uniques: { all: number };
  }[];
}
```

#### cf_purge_cache
Purges Cloudflare cache.
```typescript
interface CFPurgeCacheInput {
  zoneId: string;
  purgeEverything?: boolean;
  files?: string[];
  tags?: string[];
  hosts?: string[];
  prefixes?: string[];
}

interface CFPurgeCacheOutput {
  success: boolean;
  id: string;
}
```

#### cf_list_dns_records
Lists DNS records.
```typescript
interface CFListDNSRecordsInput {
  zoneId: string;
  type?: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV';
  name?: string;
}

interface CFDNSRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
  priority?: number;
  createdOn: string;
  modifiedOn: string;
}
```

#### cf_create_dns_record
Creates a DNS record.
```typescript
interface CFCreateDNSRecordInput {
  zoneId: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV';
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
}
```

#### cf_firewall_events
Gets firewall events.
```typescript
interface CFFirewallEventsInput {
  zoneId: string;
  since?: string;
  until?: string;
  action?: 'block' | 'challenge' | 'jschallenge' | 'managed_challenge' | 'allow' | 'log';
}

interface CFFirewallEvent {
  action: string;
  clientIP: string;
  clientCountry: string;
  datetime: string;
  rayId: string;
  source: string;
  userAgent: string;
  uri: string;
  matches: {
    ruleId: string;
    ruleName: string;
    source: string;
  }[];
}
```

---

## Module 13: Utilities

### Tools

#### util_screenshot
Captures screenshot of a page.
```typescript
interface ScreenshotInput {
  url: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  fullPage?: boolean;
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;                 // For jpeg/webp
}

interface ScreenshotOutput {
  url: string;
  device: string;
  viewport: { width: number; height: number };
  image: string;                    // Base64 or URL
  format: string;
  size: number;
}
```

#### util_detect_technologies
Detects technologies used on a site.
```typescript
interface DetectTechnologiesInput {
  url: string;
}

interface DetectTechnologiesOutput {
  url: string;
  technologies: {
    name: string;
    category: string;
    version?: string;
    confidence: number;
    website: string;
    icon: string;
  }[];
  categories: {
    name: string;
    technologies: string[];
  }[];
}
```

#### util_find_broken_links
Finds broken links on a page.
```typescript
interface FindBrokenLinksInput {
  url: string;
  maxDepth?: number;
  maxLinks?: number;
  includeExternal?: boolean;
}

interface FindBrokenLinksOutput {
  url: string;
  scanned: number;
  broken: {
    url: string;
    status: number;
    foundOn: string;
    linkText: string;
    type: 'internal' | 'external';
  }[];
  redirects: {
    url: string;
    redirectsTo: string;
    status: number;
    foundOn: string;
  }[];
  summary: {
    total: number;
    working: number;
    broken: number;
    redirects: number;
  };
}
```

#### util_analyze_headers
Analyzes HTTP response headers.
```typescript
interface AnalyzeHeadersInput {
  url: string;
}

interface AnalyzeHeadersOutput {
  url: string;
  status: number;
  headers: Record<string, string>;
  analysis: {
    caching: {
      cacheControl: string;
      expires: string;
      etag: boolean;
      lastModified: boolean;
      recommendation: string;
    };
    compression: {
      enabled: boolean;
      encoding: string;
    };
    security: {
      // Same as security headers check
    };
    server: {
      software: string;
      poweredBy: string;
      exposed: boolean;
    };
  };
}
```

#### util_whois
Performs WHOIS lookup.
```typescript
interface WhoisInput {
  domain: string;
}

interface WhoisOutput {
  domain: string;
  registrar: {
    name: string;
    url: string;
  };
  dates: {
    created: string;
    updated: string;
    expires: string;
  };
  status: string[];
  nameservers: string[];
  dnssec: boolean;
  registrant?: {
    organization?: string;
    country?: string;
    state?: string;
  };
}
```

---

## Module 14: Reports

### Tools

#### report_site_health
Generates comprehensive site health report.
```typescript
interface SiteHealthReportInput {
  url: string;
  includeScreenshots?: boolean;
}

interface SiteHealthReportOutput {
  url: string;
  generatedAt: string;
  overallScore: number;
  sections: {
    performance: {
      score: number;
      coreWebVitals: {
        lcp: { value: number; rating: string };
        fid: { value: number; rating: string };
        cls: { value: number; rating: string };
        inp: { value: number; rating: string };
      };
      issues: string[];
    };
    seo: {
      score: number;
      metaTags: { status: string; issues: string[] };
      structuredData: { status: string; types: string[] };
      indexability: { status: string; issues: string[] };
      issues: string[];
    };
    security: {
      score: number;
      ssl: { status: string; grade: string; expiry: string };
      headers: { status: string; grade: string };
      safeBrowsing: { status: string };
      issues: string[];
    };
    accessibility: {
      score: number;
      violations: { critical: number; serious: number; moderate: number; minor: number };
      issues: string[];
    };
  };
  recommendations: {
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    issue: string;
    fix: string;
  }[];
  screenshots?: {
    desktop: string;
    mobile: string;
  };
}
```

#### report_seo_audit
Generates SEO audit report.
```typescript
interface SEOAuditReportInput {
  url: string;
  crawlDepth?: number;
  maxPages?: number;
}

interface SEOAuditReportOutput {
  url: string;
  generatedAt: string;
  overallScore: number;
  technical: {
    robotsTxt: { status: string; issues: string[] };
    sitemap: { status: string; urls: number; issues: string[] };
    canonicals: { status: string; issues: string[] };
    redirects: { status: string; chains: number };
    https: { status: string; issues: string[] };
  };
  onPage: {
    titles: { status: string; duplicates: number; missing: number; issues: string[] };
    descriptions: { status: string; duplicates: number; missing: number; issues: string[] };
    headings: { status: string; issues: string[] };
    images: { total: number; missingAlt: number };
    links: { internal: number; external: number; broken: number };
  };
  content: {
    wordCount: { avg: number; min: number; max: number };
    thinContent: number;
    duplicateContent: number;
  };
  structuredData: {
    present: boolean;
    types: string[];
    errors: number;
    warnings: number;
  };
  pageAnalysis: {
    url: string;
    title: string;
    issues: string[];
    score: number;
  }[];
  recommendations: {
    priority: string;
    category: string;
    issue: string;
    affectedUrls: number;
    fix: string;
  }[];
}
```

#### report_executive_summary
Generates executive summary combining all data sources.
```typescript
interface ExecutiveSummaryInput {
  siteUrl: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  includeSections?: ('traffic' | 'search' | 'performance' | 'security' | 'ads')[];
}

interface ExecutiveSummaryOutput {
  siteUrl: string;
  period: { start: string; end: string };
  generatedAt: string;
  highlights: {
    type: 'positive' | 'negative' | 'neutral';
    metric: string;
    message: string;
    change?: number;
  }[];
  traffic: {
    users: number;
    sessions: number;
    pageviews: number;
    bounceRate: number;
    avgSessionDuration: number;
    changes: {
      users: number;
      sessions: number;
      pageviews: number;
    };
    topSources: { source: string; users: number }[];
    topPages: { page: string; views: number }[];
  };
  search: {
    impressions: number;
    clicks: number;
    ctr: number;
    avgPosition: number;
    changes: {
      impressions: number;
      clicks: number;
      position: number;
    };
    topQueries: { query: string; clicks: number; position: number }[];
    topPages: { page: string; clicks: number; impressions: number }[];
  };
  performance: {
    scores: { mobile: number; desktop: number };
    coreWebVitals: { lcp: string; fid: string; cls: string; inp: string };
    trend: 'improving' | 'stable' | 'declining';
  };
  security: {
    overallStatus: 'secure' | 'warnings' | 'critical';
    sslExpiry: string;
    issues: string[];
  };
  ads?: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    roas: number;
    topCampaigns: { name: string; spend: number; conversions: number }[];
  };
  recommendations: {
    priority: 'critical' | 'high' | 'medium' | 'low';
    area: string;
    recommendation: string;
  }[];
}
```

---

## Configuration

### Site Configuration Schema
```typescript
interface SiteConfig {
  id: string;
  name: string;
  url: string;
  
  // Google Services
  google?: {
    analytics?: {
      propertyId: string;
    };
    searchConsole?: {
      siteUrl: string;              // Property URL
    };
    tagManager?: {
      accountId: string;
      containerId: string;
      workspaceId?: string;
    };
    ads?: {
      customerId: string;
      managerId?: string;           // MCC ID if applicable
    };
    businessProfile?: {
      accountId: string;
      locationId?: string;
    };
  };
  
  // Cloudflare
  cloudflare?: {
    zoneId: string;
    accountId?: string;
  };
  
  // Defaults
  defaults?: {
    dateRange?: {
      preset: '7d' | '30d' | '90d' | 'ytd';
    };
    timezone?: string;
  };
}
```

### Environment Variables
```bash
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback
GOOGLE_REFRESH_TOKEN=

# OR Service Account
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/path/to/key.json
GOOGLE_SERVICE_ACCOUNT_IMPERSONATE=

# Google APIs
GOOGLE_PAGESPEED_API_KEY=
GOOGLE_SAFE_BROWSING_API_KEY=

# Cloudflare
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_EMAIL=
CLOUDFLARE_API_KEY=

# SSL Labs (optional, uses public API)
SSL_LABS_API_ENDPOINT=https://api.ssllabs.com/api/v3

# General
LOG_LEVEL=info
CACHE_TTL=300
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60000
```

---

## MCP Resources

### Available Resources

```typescript
const resources = [
  {
    uri: 'site://current',
    name: 'Current Site Configuration',
    description: 'Active site configuration and credentials status',
    mimeType: 'application/json',
  },
  {
    uri: 'site://list',
    name: 'All Sites',
    description: 'List of all configured sites',
    mimeType: 'application/json',
  },
  {
    uri: 'credentials://status',
    name: 'Credentials Status',
    description: 'Status of all API credentials and tokens',
    mimeType: 'application/json',
  },
];
```

---

## MCP Prompts

### Available Prompts

```typescript
const prompts = [
  {
    name: 'seo-analysis',
    description: 'Comprehensive SEO analysis for a website',
    arguments: [
      { name: 'url', description: 'Website URL to analyze', required: true },
    ],
  },
  {
    name: 'performance-review',
    description: 'Performance review with Core Web Vitals analysis',
    arguments: [
      { name: 'url', description: 'Website URL to analyze', required: true },
      { name: 'compare_period', description: 'Previous period to compare', required: false },
    ],
  },
  {
    name: 'security-audit',
    description: 'Security audit covering SSL, headers, and threats',
    arguments: [
      { name: 'url', description: 'Website URL to audit', required: true },
    ],
  },
  {
    name: 'gtm-setup-guide',
    description: 'Guide for setting up Google Tag Manager',
    arguments: [
      { name: 'tracking_needs', description: 'What you need to track', required: true },
    ],
  },
  {
    name: 'analytics-insights',
    description: 'Get insights from Google Analytics data',
    arguments: [
      { name: 'property_id', description: 'GA4 Property ID', required: true },
      { name: 'question', description: 'What you want to know', required: true },
    ],
  },
];
```

---

## Error Handling

### Error Types
```typescript
enum ErrorCode {
  // Authentication
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_INSUFFICIENT_SCOPE = 'AUTH_INSUFFICIENT_SCOPE',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  
  // Validation
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_URL = 'INVALID_URL',
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  
  // Resources
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ACCESS_DENIED = 'RESOURCE_ACCESS_DENIED',
  
  // External Services
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  EXTERNAL_SERVICE_TIMEOUT = 'EXTERNAL_SERVICE_TIMEOUT',
  
  // Internal
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

interface MCPError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  retryAfter?: number;
}
```

### Error Response Format
```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  isRetryable: boolean;
  retryAfter?: number;              // Seconds
}
```

---

## Rate Limiting

### Per-Service Limits
```typescript
const rateLimits = {
  // Google APIs (per minute unless noted)
  gtm: { requests: 50 },
  analytics: { requests: 100 },
  searchConsole: { requests: 1200 },  // Per day
  ads: { requests: 15000 },           // Per day
  businessProfile: { requests: 60 },
  pagespeed: { requests: 400 },       // Per day (with API key)
  safeBrowsing: { requests: 10000 },  // Per day
  indexing: { requests: 200 },        // Per day
  
  // Cloudflare
  cloudflare: { requests: 1200 },     // Per 5 minutes
  
  // SSL Labs (public API)
  sslLabs: { requests: 25 },          // Per day, be respectful
};
```

### Implementation Strategy
```typescript
interface RateLimiter {
  // Check if request is allowed
  checkLimit(service: string): Promise<{ allowed: boolean; retryAfter?: number }>;
  
  // Record a request
  recordRequest(service: string): void;
  
  // Get current usage
  getUsage(service: string): { used: number; limit: number; resetAt: Date };
}
```

---

## Caching Strategy

### Cache Layers
```typescript
interface CacheConfig {
  // In-memory cache for hot data
  memory: {
    maxItems: 1000,
    ttl: 300,                        // 5 minutes
  };
  
  // File cache for larger data
  file: {
    directory: '.cache',
    ttl: 3600,                       // 1 hour
  };
}

// Cache keys by data type
const cacheTTL = {
  // Frequently changing
  realtime: 0,                       // No cache
  uptime: 60,                        // 1 minute
  
  // Moderately stable
  performance: 300,                  // 5 minutes
  analytics: 300,
  searchQueries: 300,
  
  // Stable data
  siteConfig: 3600,                  // 1 hour
  propertyList: 3600,
  containerList: 3600,
  
  // Very stable
  metadata: 86400,                   // 24 hours
  technology: 86400,
};
```

---

## Logging

### Log Levels & Format
```typescript
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  action: string;
  duration?: number;
  metadata?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

// Example log output
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "service": "ga4",
  "action": "run_report",
  "duration": 234,
  "metadata": {
    "propertyId": "123456789",
    "dimensions": ["date", "source"],
    "metrics": ["sessions", "users"],
    "rowCount": 150
  }
}
```

---

## Testing Strategy

### Test Categories
1. **Unit Tests**: Individual tool functions
2. **Integration Tests**: API interactions (with mocks)
3. **E2E Tests**: Full MCP server operations
4. **Contract Tests**: API response validation

### Mock Strategy
```typescript
// Mock service for testing
interface MockConfig {
  service: string;
  responses: {
    method: string;
    endpoint: string | RegExp;
    response: unknown;
    status?: number;
  }[];
}
```

---

## Deployment

### Supported Modes
1. **Stdio**: Standard MCP transport
2. **HTTP/SSE**: Web-based transport (if implemented)

### Package Scripts
```json
{
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  }
}
```

### MCP Configuration (claude_desktop_config.json)
```json
{
  "mcpServers": {
    "website-ops": {
      "command": "node",
      "args": ["/path/to/website-ops-mcp/dist/index.js"],
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_KEY_FILE": "/path/to/key.json",
        "GOOGLE_PAGESPEED_API_KEY": "your-api-key",
        "CLOUDFLARE_API_TOKEN": "your-token"
      }
    }
  }
}
```

---

## Development Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Project setup with TypeScript
- [ ] MCP SDK integration
- [ ] Google OAuth/Service Account authentication
- [ ] Token management and refresh
- [ ] Basic rate limiting
- [ ] Logging infrastructure

### Phase 2: Core Google Tools (Week 3-5)
- [ ] Google Tag Manager tools
- [ ] Google Analytics 4 tools
- [ ] Google Search Console tools
- [ ] PageSpeed Insights tools
- [ ] Indexing API tools

### Phase 3: Extended Google Tools (Week 6-7)
- [ ] Google Ads tools
- [ ] Google Business Profile tools

### Phase 4: Security & SEO (Week 8-9)
- [ ] Security analysis tools
- [ ] SEO technical tools
- [ ] Accessibility tools

### Phase 5: Monitoring & Utilities (Week 10)
- [ ] Uptime monitoring tools
- [ ] DNS tools
- [ ] Certificate monitoring
- [ ] Utility tools (screenshots, tech detection)

### Phase 6: Integrations & Reports (Week 11-12)
- [ ] Cloudflare integration
- [ ] Report generators
- [ ] Multi-site support
- [ ] MCP resources and prompts

### Phase 7: Polish & Documentation (Week 13)
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] Performance optimization
- [ ] Release preparation

---

## Success Metrics

### Functional
- All 70+ tools implemented and tested
- 95%+ test coverage on critical paths
- Sub-second response times for simple queries
- Graceful handling of all error scenarios

### Operational
- Clear setup documentation
- Environment validation on startup
- Helpful error messages
- Comprehensive logging for debugging

---

## Future Enhancements

### Potential Additions
- Bing Webmaster Tools integration
- Social media analytics (Meta, Twitter)
- Email marketing platforms (Mailchimp, SendGrid)
- CRM integrations (HubSpot, Salesforce)
- Custom webhook notifications
- Scheduled report generation
- AI-powered recommendations engine
- Competitive analysis tools

---

## License

MIT License - Free for commercial and personal use.

---

## References

### API Documentation
- [Google Tag Manager API](https://developers.google.com/tag-platform/tag-manager/api/v2)
- [Google Analytics Data API](https://developers.google.com/analytics/devguides/reporting/data/v1)
- [Google Search Console API](https://developers.google.com/webmaster-tools/v1/api_reference_index)
- [Google Ads API](https://developers.google.com/google-ads/api/docs/start)
- [Google Business Profile API](https://developers.google.com/my-business)
- [PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started)
- [Indexing API](https://developers.google.com/search/apis/indexing-api/v3/quickstart)
- [Safe Browsing API](https://developers.google.com/safe-browsing/v4)
- [Chrome UX Report API](https://developer.chrome.com/docs/crux/api)
- [Cloudflare API](https://developers.cloudflare.com/api)
- [SSL Labs API](https://github.com/ssllabs/ssllabs-scan/blob/master/ssllabs-api-docs-v3.md)

### MCP Documentation
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
