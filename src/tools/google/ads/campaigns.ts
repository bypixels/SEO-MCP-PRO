/**
 * Google Ads - Campaign tools
 */

import { z } from 'zod';
import { getAdsClient, getRefreshToken, getLoginCustomerId } from './client.js';
import { createServiceLogger } from '../../../utils/logger.js';
import { MCPError, ErrorCode } from '../../../types/errors.js';
import type { ToolDefinition } from '../../../types/tools.js';
import { ToolCategory } from '../../../types/tools.js';

const log = createServiceLogger('ads-campaigns');

// ============================================
// Types
// ============================================

interface AdsCampaign {
  resourceName: string;
  id: string;
  name: string;
  status: string;
  advertisingChannelType: string;
  startDate?: string;
  endDate?: string;
  biddingStrategyType?: string;
}

interface AdsAdGroup {
  resourceName: string;
  id: string;
  name: string;
  status: string;
  campaignId: string;
  campaignName: string;
  type: string;
}

interface AdsKeyword {
  resourceName: string;
  criterionId: string;
  adGroupId: string;
  adGroupName: string;
  keywordText: string;
  matchType: string;
  status: string;
  qualityScore?: number;
}

// ============================================
// List Campaigns
// ============================================

const listCampaignsSchema = z.object({
  customerId: z.string().describe('Google Ads Customer ID'),
  status: z.enum(['ENABLED', 'PAUSED', 'REMOVED']).optional().describe('Filter by status'),
  type: z.enum(['SEARCH', 'DISPLAY', 'SHOPPING', 'VIDEO', 'PERFORMANCE_MAX'])
    .optional().describe('Filter by campaign type'),
  limit: z.number().min(1).max(10000).optional().describe('Maximum results'),
});

type ListCampaignsInput = z.infer<typeof listCampaignsSchema>;

interface ListCampaignsOutput {
  campaigns: AdsCampaign[];
}

export const adsListCampaignsTool: ToolDefinition<ListCampaignsInput, ListCampaignsOutput> = {
  name: 'ads_list_campaigns',
  description: 'Lists campaigns in a Google Ads account',
  category: ToolCategory.GOOGLE,
  inputSchema: listCampaignsSchema,

  async handler(input: ListCampaignsInput): Promise<ListCampaignsOutput> {
    log.info('Listing Ads campaigns', { customerId: input.customerId });

    const client = getAdsClient();
    const refreshToken = getRefreshToken();
    const customerId = input.customerId.replace(/-/g, '');

    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
      login_customer_id: getLoginCustomerId(),
    });

    // Build WHERE clause
    const conditions: string[] = [];
    if (input.status) {
      conditions.push(`campaign.status = '${input.status}'`);
    }
    if (input.type) {
      conditions.push(`campaign.advertising_channel_type = '${input.type}'`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const limitClause = input.limit ? `LIMIT ${input.limit}` : 'LIMIT 1000';

    const result = await customer.query(`
      SELECT
        campaign.resource_name,
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.start_date,
        campaign.end_date,
        campaign.bidding_strategy_type
      FROM campaign
      ${whereClause}
      ORDER BY campaign.name
      ${limitClause}
    `);

    const campaigns: AdsCampaign[] = result.map((row) => {
      const c = row.campaign;
      return {
        resourceName: c?.resource_name || '',
        id: String(c?.id || ''),
        name: c?.name || '',
        status: String(c?.status || ''),
        advertisingChannelType: String(c?.advertising_channel_type || ''),
        startDate: c?.start_date || undefined,
        endDate: c?.end_date || undefined,
        biddingStrategyType: c?.bidding_strategy_type ? String(c.bidding_strategy_type) : undefined,
      };
    });

    log.info('Listed Ads campaigns', { count: campaigns.length });

    return { campaigns };
  },
};

// ============================================
// Get Campaign
// ============================================

const getCampaignSchema = z.object({
  customerId: z.string().describe('Google Ads Customer ID'),
  campaignId: z.string().describe('Campaign ID'),
});

type GetCampaignInput = z.infer<typeof getCampaignSchema>;

export const adsGetCampaignTool: ToolDefinition<GetCampaignInput, AdsCampaign> = {
  name: 'ads_get_campaign',
  description: 'Gets details of a specific Google Ads campaign',
  category: ToolCategory.GOOGLE,
  inputSchema: getCampaignSchema,

  async handler(input: GetCampaignInput): Promise<AdsCampaign> {
    log.info('Getting Ads campaign', input);

    const client = getAdsClient();
    const refreshToken = getRefreshToken();
    const customerId = input.customerId.replace(/-/g, '');

    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
      login_customer_id: getLoginCustomerId(),
    });

    const result = await customer.query(`
      SELECT
        campaign.resource_name,
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.start_date,
        campaign.end_date,
        campaign.bidding_strategy_type
      FROM campaign
      WHERE campaign.id = ${input.campaignId}
      LIMIT 1
    `);

    if (result.length === 0 || !result[0].campaign) {
      throw new MCPError({
        code: ErrorCode.RESOURCE_NOT_FOUND,
        message: `Campaign not found: ${input.campaignId}`,
        retryable: false,
        service: 'ads',
      });
    }

    const c = result[0].campaign;

    return {
      resourceName: c.resource_name || '',
      id: String(c.id || ''),
      name: c.name || '',
      status: String(c.status || ''),
      advertisingChannelType: String(c.advertising_channel_type || ''),
      startDate: c.start_date || undefined,
      endDate: c.end_date || undefined,
      biddingStrategyType: c.bidding_strategy_type ? String(c.bidding_strategy_type) : undefined,
    };
  },
};

// ============================================
// List Ad Groups
// ============================================

const listAdGroupsSchema = z.object({
  customerId: z.string().describe('Google Ads Customer ID'),
  campaignId: z.string().optional().describe('Filter by campaign ID'),
  status: z.enum(['ENABLED', 'PAUSED', 'REMOVED']).optional().describe('Filter by status'),
  limit: z.number().min(1).max(10000).optional().describe('Maximum results'),
});

type ListAdGroupsInput = z.infer<typeof listAdGroupsSchema>;

interface ListAdGroupsOutput {
  adGroups: AdsAdGroup[];
}

export const adsListAdGroupsTool: ToolDefinition<ListAdGroupsInput, ListAdGroupsOutput> = {
  name: 'ads_list_ad_groups',
  description: 'Lists ad groups in a Google Ads account',
  category: ToolCategory.GOOGLE,
  inputSchema: listAdGroupsSchema,

  async handler(input: ListAdGroupsInput): Promise<ListAdGroupsOutput> {
    log.info('Listing Ads ad groups', { customerId: input.customerId });

    const client = getAdsClient();
    const refreshToken = getRefreshToken();
    const customerId = input.customerId.replace(/-/g, '');

    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
      login_customer_id: getLoginCustomerId(),
    });

    // Build WHERE clause
    const conditions: string[] = [];
    if (input.campaignId) {
      conditions.push(`campaign.id = ${input.campaignId}`);
    }
    if (input.status) {
      conditions.push(`ad_group.status = '${input.status}'`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const limitClause = input.limit ? `LIMIT ${input.limit}` : 'LIMIT 1000';

    const result = await customer.query(`
      SELECT
        ad_group.resource_name,
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group.type,
        campaign.id,
        campaign.name
      FROM ad_group
      ${whereClause}
      ORDER BY ad_group.name
      ${limitClause}
    `);

    const adGroups: AdsAdGroup[] = result.map((row) => {
      const ag = row.ad_group;
      const c = row.campaign;
      return {
        resourceName: ag?.resource_name || '',
        id: String(ag?.id || ''),
        name: ag?.name || '',
        status: String(ag?.status || ''),
        type: String(ag?.type || ''),
        campaignId: String(c?.id || ''),
        campaignName: c?.name || '',
      };
    });

    log.info('Listed Ads ad groups', { count: adGroups.length });

    return { adGroups };
  },
};

// ============================================
// List Keywords
// ============================================

const listKeywordsSchema = z.object({
  customerId: z.string().describe('Google Ads Customer ID'),
  campaignId: z.string().optional().describe('Filter by campaign ID'),
  adGroupId: z.string().optional().describe('Filter by ad group ID'),
  status: z.enum(['ENABLED', 'PAUSED', 'REMOVED']).optional().describe('Filter by status'),
  limit: z.number().min(1).max(10000).optional().describe('Maximum results'),
});

type ListKeywordsInput = z.infer<typeof listKeywordsSchema>;

interface ListKeywordsOutput {
  keywords: AdsKeyword[];
}

export const adsListKeywordsTool: ToolDefinition<ListKeywordsInput, ListKeywordsOutput> = {
  name: 'ads_list_keywords',
  description: 'Lists keywords in a Google Ads account',
  category: ToolCategory.GOOGLE,
  inputSchema: listKeywordsSchema,

  async handler(input: ListKeywordsInput): Promise<ListKeywordsOutput> {
    log.info('Listing Ads keywords', { customerId: input.customerId });

    const client = getAdsClient();
    const refreshToken = getRefreshToken();
    const customerId = input.customerId.replace(/-/g, '');

    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
      login_customer_id: getLoginCustomerId(),
    });

    // Build WHERE clause
    const conditions: string[] = [];
    if (input.campaignId) {
      conditions.push(`campaign.id = ${input.campaignId}`);
    }
    if (input.adGroupId) {
      conditions.push(`ad_group.id = ${input.adGroupId}`);
    }
    if (input.status) {
      conditions.push(`ad_group_criterion.status = '${input.status}'`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const limitClause = input.limit ? `LIMIT ${input.limit}` : 'LIMIT 1000';

    const result = await customer.query(`
      SELECT
        ad_group_criterion.resource_name,
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        ad_group_criterion.quality_info.quality_score,
        ad_group.id,
        ad_group.name
      FROM ad_group_criterion
      ${whereClause}
      AND ad_group_criterion.type = 'KEYWORD'
      ORDER BY ad_group_criterion.keyword.text
      ${limitClause}
    `);

    const keywords: AdsKeyword[] = result.map((row) => {
      const agc = row.ad_group_criterion;
      const ag = row.ad_group;
      return {
        resourceName: agc?.resource_name || '',
        criterionId: String(agc?.criterion_id || ''),
        keywordText: agc?.keyword?.text || '',
        matchType: String(agc?.keyword?.match_type || ''),
        status: String(agc?.status || ''),
        qualityScore: agc?.quality_info?.quality_score || undefined,
        adGroupId: String(ag?.id || ''),
        adGroupName: ag?.name || '',
      };
    });

    log.info('Listed Ads keywords', { count: keywords.length });

    return { keywords };
  },
};
