/**
 * Google Ads - Reports tools
 */

import { z } from 'zod';
import { getAdsClient, getRefreshToken, getLoginCustomerId } from './client.js';
import { createServiceLogger } from '../../../utils/logger.js';
import type { ToolDefinition } from '../../../types/tools.js';
import { ToolCategory } from '../../../types/tools.js';

const log = createServiceLogger('ads-reports');

// ============================================
// Campaign Performance Report
// ============================================

const campaignPerformanceSchema = z.object({
  customerId: z.string().describe('Google Ads Customer ID'),
  campaignId: z.string().optional().describe('Filter by campaign ID'),
  dateRange: z.object({
    startDate: z.string().describe('Start date (YYYY-MM-DD)'),
    endDate: z.string().describe('End date (YYYY-MM-DD)'),
  }),
});

type CampaignPerformanceInput = z.infer<typeof campaignPerformanceSchema>;

interface CampaignMetrics {
  campaignId: string;
  campaignName: string;
  status: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgCpc: number;
  cost: number;
  conversions: number;
  conversionRate: number;
  costPerConversion: number;
}

interface CampaignPerformanceOutput {
  campaigns: CampaignMetrics[];
  totals: {
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
  };
}

export const adsCampaignPerformanceTool: ToolDefinition<CampaignPerformanceInput, CampaignPerformanceOutput> = {
  name: 'ads_campaign_performance',
  description: 'Gets campaign performance metrics for a date range',
  category: ToolCategory.GOOGLE,
  inputSchema: campaignPerformanceSchema,

  async handler(input: CampaignPerformanceInput): Promise<CampaignPerformanceOutput> {
    log.info('Getting campaign performance', {
      customerId: input.customerId,
      dateRange: input.dateRange,
    });

    const client = getAdsClient();
    const refreshToken = getRefreshToken();
    const customerId = input.customerId.replace(/-/g, '');

    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
      login_customer_id: getLoginCustomerId(),
    });

    // Build WHERE clause
    const conditions = [
      `segments.date BETWEEN '${input.dateRange.startDate}' AND '${input.dateRange.endDate}'`,
    ];

    if (input.campaignId) {
      conditions.push(`campaign.id = ${input.campaignId}`);
    }

    const result = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_from_interactions_rate,
        metrics.cost_per_conversion
      FROM campaign
      WHERE ${conditions.join(' AND ')}
      AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
    `);

    const campaigns: CampaignMetrics[] = result.map((row) => {
      const c = row.campaign;
      const m = row.metrics;
      return {
        campaignId: String(c?.id || ''),
        campaignName: c?.name || '',
        status: String(c?.status || ''),
        impressions: Number(m?.impressions || 0),
        clicks: Number(m?.clicks || 0),
        ctr: Number(m?.ctr || 0),
        avgCpc: Number(m?.average_cpc || 0) / 1000000, // Convert from micros
        cost: Number(m?.cost_micros || 0) / 1000000, // Convert from micros
        conversions: Number(m?.conversions || 0),
        conversionRate: Number(m?.conversions_from_interactions_rate || 0),
        costPerConversion: Number(m?.cost_per_conversion || 0) / 1000000,
      };
    });

    // Calculate totals
    const totals = campaigns.reduce(
      (acc, c) => ({
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        cost: acc.cost + c.cost,
        conversions: acc.conversions + c.conversions,
      }),
      { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
    );

    log.info('Campaign performance retrieved', { count: campaigns.length });

    return { campaigns, totals };
  },
};

// ============================================
// Search Term Report
// ============================================

const searchTermReportSchema = z.object({
  customerId: z.string().describe('Google Ads Customer ID'),
  campaignId: z.string().optional().describe('Filter by campaign ID'),
  adGroupId: z.string().optional().describe('Filter by ad group ID'),
  dateRange: z.object({
    startDate: z.string().describe('Start date (YYYY-MM-DD)'),
    endDate: z.string().describe('End date (YYYY-MM-DD)'),
  }),
  minImpressions: z.number().optional().describe('Minimum impressions filter'),
  limit: z.number().min(1).max(10000).optional().describe('Maximum results'),
});

type SearchTermReportInput = z.infer<typeof searchTermReportSchema>;

interface SearchTerm {
  searchTerm: string;
  campaignName: string;
  adGroupName: string;
  matchType: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
  conversions: number;
}

interface SearchTermReportOutput {
  searchTerms: SearchTerm[];
}

export const adsSearchTermReportTool: ToolDefinition<SearchTermReportInput, SearchTermReportOutput> = {
  name: 'ads_search_term_report',
  description: 'Gets search terms report showing actual user queries',
  category: ToolCategory.GOOGLE,
  inputSchema: searchTermReportSchema,

  async handler(input: SearchTermReportInput): Promise<SearchTermReportOutput> {
    log.info('Getting search term report', {
      customerId: input.customerId,
      dateRange: input.dateRange,
    });

    const client = getAdsClient();
    const refreshToken = getRefreshToken();
    const customerId = input.customerId.replace(/-/g, '');

    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
      login_customer_id: getLoginCustomerId(),
    });

    // Build WHERE clause
    const conditions = [
      `segments.date BETWEEN '${input.dateRange.startDate}' AND '${input.dateRange.endDate}'`,
    ];

    if (input.campaignId) {
      conditions.push(`campaign.id = ${input.campaignId}`);
    }
    if (input.adGroupId) {
      conditions.push(`ad_group.id = ${input.adGroupId}`);
    }
    if (input.minImpressions) {
      conditions.push(`metrics.impressions >= ${input.minImpressions}`);
    }

    const limitClause = input.limit ? `LIMIT ${input.limit}` : 'LIMIT 1000';

    const result = await customer.query(`
      SELECT
        search_term_view.search_term,
        campaign.name,
        ad_group.name,
        segments.keyword.info.match_type,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.cost_micros,
        metrics.conversions
      FROM search_term_view
      WHERE ${conditions.join(' AND ')}
      ORDER BY metrics.impressions DESC
      ${limitClause}
    `);

    const searchTerms: SearchTerm[] = result.map((row) => {
      const st = row.search_term_view;
      const c = row.campaign;
      const ag = row.ad_group;
      const seg = row.segments;
      const m = row.metrics;
      return {
        searchTerm: st?.search_term || '',
        campaignName: c?.name || '',
        adGroupName: ag?.name || '',
        matchType: String(seg?.keyword?.info?.match_type || ''),
        impressions: Number(m?.impressions || 0),
        clicks: Number(m?.clicks || 0),
        ctr: Number(m?.ctr || 0),
        cost: Number(m?.cost_micros || 0) / 1000000,
        conversions: Number(m?.conversions || 0),
      };
    });

    log.info('Search term report retrieved', { count: searchTerms.length });

    return { searchTerms };
  },
};

// ============================================
// Account Summary
// ============================================

const accountSummarySchema = z.object({
  customerId: z.string().describe('Google Ads Customer ID'),
  dateRange: z.object({
    startDate: z.string().describe('Start date (YYYY-MM-DD)'),
    endDate: z.string().describe('End date (YYYY-MM-DD)'),
  }),
});

type AccountSummaryInput = z.infer<typeof accountSummarySchema>;

interface AccountSummaryOutput {
  accountId: string;
  accountName: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
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
  campaignCount: number;
  adGroupCount: number;
  keywordCount: number;
}

export const adsAccountSummaryTool: ToolDefinition<AccountSummaryInput, AccountSummaryOutput> = {
  name: 'ads_account_summary',
  description: 'Gets a summary of account performance metrics',
  category: ToolCategory.GOOGLE,
  inputSchema: accountSummarySchema,

  async handler(input: AccountSummaryInput): Promise<AccountSummaryOutput> {
    log.info('Getting account summary', {
      customerId: input.customerId,
      dateRange: input.dateRange,
    });

    const client = getAdsClient();
    const refreshToken = getRefreshToken();
    const customerId = input.customerId.replace(/-/g, '');

    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
      login_customer_id: getLoginCustomerId(),
    });

    // Get account metrics
    const metricsResult = await customer.query(`
      SELECT
        customer.id,
        customer.descriptive_name,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_from_interactions_rate,
        metrics.cost_per_conversion
      FROM customer
      WHERE segments.date BETWEEN '${input.dateRange.startDate}' AND '${input.dateRange.endDate}'
    `);

    // Get counts
    const [campaignCount, adGroupCount, keywordCount] = await Promise.all([
      customer.query(`
        SELECT COUNT(campaign.id) AS count
        FROM campaign
        WHERE campaign.status != 'REMOVED'
      `).then((r) => r.length),
      customer.query(`
        SELECT COUNT(ad_group.id) AS count
        FROM ad_group
        WHERE ad_group.status != 'REMOVED'
      `).then((r) => r.length),
      customer.query(`
        SELECT COUNT(ad_group_criterion.criterion_id) AS count
        FROM ad_group_criterion
        WHERE ad_group_criterion.type = 'KEYWORD'
        AND ad_group_criterion.status != 'REMOVED'
      `).then((r) => r.length),
    ]);

    // Aggregate metrics
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalCost = 0;
    let totalConversions = 0;
    let accountName = '';
    let accountId = customerId;

    for (const row of metricsResult) {
      if (row.customer) {
        accountId = String(row.customer.id || accountId);
        accountName = row.customer.descriptive_name || '';
      }
      if (row.metrics) {
        totalImpressions += Number(row.metrics.impressions || 0);
        totalClicks += Number(row.metrics.clicks || 0);
        totalCost += Number(row.metrics.cost_micros || 0);
        totalConversions += Number(row.metrics.conversions || 0);
      }
    }

    const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
    const avgCpc = totalClicks > 0 ? (totalCost / 1000000) / totalClicks : 0;
    const conversionRate = totalClicks > 0 ? totalConversions / totalClicks : 0;
    const costPerConversion = totalConversions > 0 ? (totalCost / 1000000) / totalConversions : 0;

    log.info('Account summary retrieved');

    return {
      accountId,
      accountName,
      dateRange: input.dateRange,
      metrics: {
        impressions: totalImpressions,
        clicks: totalClicks,
        ctr,
        avgCpc,
        cost: totalCost / 1000000,
        conversions: totalConversions,
        conversionRate,
        costPerConversion,
      },
      campaignCount,
      adGroupCount,
      keywordCount,
    };
  },
};
