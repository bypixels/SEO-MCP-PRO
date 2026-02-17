/**
 * Google Ads - Customer/Account tools
 */

import { z } from 'zod';
import { getAdsClient, getRefreshToken, getLoginCustomerId } from './client.js';
import { createServiceLogger } from '../../../utils/logger.js';
import { MCPError, ErrorCode } from '../../../types/errors.js';
import type { ToolDefinition } from '../../../types/tools.js';
import { ToolCategory } from '../../../types/tools.js';

const log = createServiceLogger('ads-customers');

// ============================================
// Types
// ============================================

interface AdsCustomer {
  resourceName: string;
  id: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
  manager: boolean;
  testAccount: boolean;
}

// ============================================
// List Accessible Customers
// ============================================

const listCustomersSchema = z.object({});

type ListCustomersInput = z.infer<typeof listCustomersSchema>;

interface ListCustomersOutput {
  customers: AdsCustomer[];
}

export const adsListCustomersTool: ToolDefinition<ListCustomersInput, ListCustomersOutput> = {
  name: 'ads_list_customers',
  description: 'Lists all Google Ads customer accounts accessible to the authenticated user',
  category: ToolCategory.GOOGLE,
  inputSchema: listCustomersSchema,

  async handler(_input: ListCustomersInput): Promise<ListCustomersOutput> {
    log.info('Listing Ads customers');

    const client = getAdsClient();
    const refreshToken = getRefreshToken();

    // First get list of accessible customer IDs
    const accessibleCustomers = await client.listAccessibleCustomers(refreshToken);
    const customerIds = accessibleCustomers.resource_names || [];

    // Then get details for each customer
    const customers: AdsCustomer[] = [];

    for (const resourceName of customerIds) {
      const customerId = resourceName.replace('customers/', '');
      try {
        const customer = client.Customer({
          customer_id: customerId,
          refresh_token: refreshToken,
          login_customer_id: getLoginCustomerId(),
        });

        const result = await customer.query(`
          SELECT
            customer.resource_name,
            customer.id,
            customer.descriptive_name,
            customer.currency_code,
            customer.time_zone,
            customer.manager,
            customer.test_account
          FROM customer
          LIMIT 1
        `);

        if (result.length > 0) {
          const c = result[0].customer;
          if (c) {
            customers.push({
              resourceName: c.resource_name || '',
              id: String(c.id || ''),
              descriptiveName: c.descriptive_name || '',
              currencyCode: c.currency_code || '',
              timeZone: c.time_zone || '',
              manager: c.manager || false,
              testAccount: c.test_account || false,
            });
          }
        }
      } catch (error) {
        log.warn(`Failed to get details for customer ${customerId}`, {
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    log.info('Listed Ads customers', { count: customers.length });

    return { customers };
  },
};

// ============================================
// Get Customer
// ============================================

const getCustomerSchema = z.object({
  customerId: z.string().describe('Google Ads Customer ID (without dashes)'),
});

type GetCustomerInput = z.infer<typeof getCustomerSchema>;

export const adsGetCustomerTool: ToolDefinition<GetCustomerInput, AdsCustomer> = {
  name: 'ads_get_customer',
  description: 'Gets details of a specific Google Ads customer account',
  category: ToolCategory.GOOGLE,
  inputSchema: getCustomerSchema,

  async handler(input: GetCustomerInput): Promise<AdsCustomer> {
    log.info('Getting Ads customer', { customerId: input.customerId });

    const client = getAdsClient();
    const refreshToken = getRefreshToken();

    // Remove dashes from customer ID if present
    const customerId = input.customerId.replace(/-/g, '');

    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
      login_customer_id: getLoginCustomerId(),
    });

    const result = await customer.query(`
      SELECT
        customer.resource_name,
        customer.id,
        customer.descriptive_name,
        customer.currency_code,
        customer.time_zone,
        customer.manager,
        customer.test_account
      FROM customer
      LIMIT 1
    `);

    if (result.length === 0 || !result[0].customer) {
      throw new MCPError({
        code: ErrorCode.RESOURCE_NOT_FOUND,
        message: `Customer not found: ${customerId}`,
        retryable: false,
        service: 'ads',
      });
    }

    const c = result[0].customer;

    return {
      resourceName: c.resource_name || '',
      id: String(c.id || ''),
      descriptiveName: c.descriptive_name || '',
      currencyCode: c.currency_code || '',
      timeZone: c.time_zone || '',
      manager: c.manager || false,
      testAccount: c.test_account || false,
    };
  },
};
