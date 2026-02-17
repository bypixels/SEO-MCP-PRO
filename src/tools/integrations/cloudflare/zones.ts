/**
 * Cloudflare Zones and DNS tools
 */

import { z } from 'zod';
import axios from 'axios';
import { createServiceLogger } from '../../../utils/logger.js';
import { MCPError, ErrorCode } from '../../../types/errors.js';
import type { ToolDefinition } from '../../../types/tools.js';
import { ToolCategory } from '../../../types/tools.js';

const log = createServiceLogger('cloudflare-zones');

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Get Cloudflare API headers
 */
function getCloudflareHeaders(): Record<string, string> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const email = process.env.CLOUDFLARE_EMAIL;
  const apiKey = process.env.CLOUDFLARE_API_KEY;

  if (apiToken) {
    return {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  if (email && apiKey) {
    return {
      'X-Auth-Email': email,
      'X-Auth-Key': apiKey,
      'Content-Type': 'application/json',
    };
  }

  throw new MCPError({
    code: ErrorCode.AUTH_NOT_CONFIGURED,
    message: 'Cloudflare credentials not configured. Set CLOUDFLARE_API_TOKEN or CLOUDFLARE_EMAIL and CLOUDFLARE_API_KEY.',
    retryable: false,
    service: 'cloudflare',
  });
}

// ============================================
// Get Zones
// ============================================

const getZonesSchema = z.object({
  name: z.string().optional().describe('Filter by zone name'),
  status: z.enum(['active', 'pending', 'initializing', 'moved', 'deleted', 'deactivated'])
    .optional()
    .describe('Filter by status'),
  page: z.number().min(1).optional().describe('Page number'),
  perPage: z.number().min(5).max(50).optional().describe('Results per page'),
});

type GetZonesInput = z.infer<typeof getZonesSchema>;

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

interface GetZonesOutput {
  zones: CFZone[];
  totalCount: number;
  page: number;
  perPage: number;
}

export const cfGetZonesTool: ToolDefinition<GetZonesInput, GetZonesOutput> = {
  name: 'cf_get_zones',
  description: 'Lists Cloudflare zones accessible to the authenticated user',
  category: ToolCategory.CLOUDFLARE,
  inputSchema: getZonesSchema,

  async handler(input: GetZonesInput): Promise<GetZonesOutput> {
    log.info('Listing Cloudflare zones', input);

    const params = new URLSearchParams();
    if (input.name) params.append('name', input.name);
    if (input.status) params.append('status', input.status);
    if (input.page) params.append('page', String(input.page));
    if (input.perPage) params.append('per_page', String(input.perPage));

    const response = await axios.get(`${CF_API_BASE}/zones?${params}`, {
      headers: getCloudflareHeaders(),
      timeout: 30000,
    });

    const data = response.data;

    if (!data.success) {
      throw MCPError.externalServiceError('cloudflare', data.errors?.[0]?.message || 'Unknown error');
    }

    const zones: CFZone[] = (data.result || []).map((z: Record<string, unknown>) => ({
      id: z.id as string,
      name: z.name as string,
      status: z.status as string,
      paused: z.paused as boolean,
      type: z.type as string,
      nameServers: z.name_servers as string[] || [],
      originalNameServers: z.original_name_servers as string[] || [],
      createdOn: z.created_on as string,
      modifiedOn: z.modified_on as string,
    }));

    log.info('Listed Cloudflare zones', { count: zones.length });

    return {
      zones,
      totalCount: data.result_info?.total_count || zones.length,
      page: data.result_info?.page || 1,
      perPage: data.result_info?.per_page || 20,
    };
  },
};

// ============================================
// List DNS Records
// ============================================

const listDNSRecordsSchema = z.object({
  zoneId: z.string().describe('Cloudflare Zone ID'),
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']).optional().describe('Record type filter'),
  name: z.string().optional().describe('Record name filter'),
  page: z.number().min(1).optional().describe('Page number'),
  perPage: z.number().min(5).max(100).optional().describe('Results per page'),
});

type ListDNSRecordsInput = z.infer<typeof listDNSRecordsSchema>;

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

interface ListDNSRecordsOutput {
  records: CFDNSRecord[];
  totalCount: number;
}

export const cfListDNSRecordsTool: ToolDefinition<ListDNSRecordsInput, ListDNSRecordsOutput> = {
  name: 'cf_list_dns_records',
  description: 'Lists DNS records for a Cloudflare zone',
  category: ToolCategory.CLOUDFLARE,
  inputSchema: listDNSRecordsSchema,

  async handler(input: ListDNSRecordsInput): Promise<ListDNSRecordsOutput> {
    log.info('Listing DNS records', { zoneId: input.zoneId });

    const params = new URLSearchParams();
    if (input.type) params.append('type', input.type);
    if (input.name) params.append('name', input.name);
    if (input.page) params.append('page', String(input.page));
    if (input.perPage) params.append('per_page', String(input.perPage));

    const response = await axios.get(
      `${CF_API_BASE}/zones/${input.zoneId}/dns_records?${params}`,
      {
        headers: getCloudflareHeaders(),
        timeout: 30000,
      }
    );

    const data = response.data;

    if (!data.success) {
      throw MCPError.externalServiceError('cloudflare', data.errors?.[0]?.message || 'Unknown error');
    }

    const records: CFDNSRecord[] = (data.result || []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      type: r.type as string,
      name: r.name as string,
      content: r.content as string,
      proxied: r.proxied as boolean,
      ttl: r.ttl as number,
      priority: r.priority as number | undefined,
      createdOn: r.created_on as string,
      modifiedOn: r.modified_on as string,
    }));

    log.info('Listed DNS records', { count: records.length });

    return {
      records,
      totalCount: data.result_info?.total_count || records.length,
    };
  },
};

// ============================================
// Create DNS Record
// ============================================

const createDNSRecordSchema = z.object({
  zoneId: z.string().describe('Cloudflare Zone ID'),
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']).describe('Record type'),
  name: z.string().describe('Record name (e.g., @ for root, www for subdomain)'),
  content: z.string().describe('Record content (IP, hostname, or text)'),
  ttl: z.number().min(1).optional().describe('TTL in seconds (1 for auto)'),
  proxied: z.boolean().optional().describe('Whether to proxy through Cloudflare'),
  priority: z.number().min(0).max(65535).optional().describe('Priority (for MX records)'),
});

type CreateDNSRecordInput = z.infer<typeof createDNSRecordSchema>;

export const cfCreateDNSRecordTool: ToolDefinition<CreateDNSRecordInput, CFDNSRecord> = {
  name: 'cf_create_dns_record',
  description: 'Creates a new DNS record in a Cloudflare zone',
  category: ToolCategory.CLOUDFLARE,
  inputSchema: createDNSRecordSchema,

  async handler(input: CreateDNSRecordInput): Promise<CFDNSRecord> {
    log.info('Creating DNS record', { zoneId: input.zoneId, type: input.type, name: input.name });

    const requestBody: Record<string, unknown> = {
      type: input.type,
      name: input.name,
      content: input.content,
      ttl: input.ttl || 1,
    };

    if (input.proxied !== undefined) {
      requestBody.proxied = input.proxied;
    }

    if (input.priority !== undefined) {
      requestBody.priority = input.priority;
    }

    const response = await axios.post(
      `${CF_API_BASE}/zones/${input.zoneId}/dns_records`,
      requestBody,
      {
        headers: getCloudflareHeaders(),
        timeout: 30000,
      }
    );

    const data = response.data;

    if (!data.success) {
      throw MCPError.externalServiceError('cloudflare', data.errors?.[0]?.message || 'Unknown error');
    }

    const r = data.result;

    log.info('Created DNS record', { id: r.id });

    return {
      id: r.id,
      type: r.type,
      name: r.name,
      content: r.content,
      proxied: r.proxied,
      ttl: r.ttl,
      priority: r.priority,
      createdOn: r.created_on,
      modifiedOn: r.modified_on,
    };
  },
};
