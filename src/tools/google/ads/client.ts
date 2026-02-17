/**
 * Google Ads - Client initialization
 */

import { GoogleAdsApi } from 'google-ads-api';
import { MCPError, ErrorCode } from '../../../types/errors.js';
import { createServiceLogger } from '../../../utils/logger.js';

const log = createServiceLogger('ads-client');

let adsClient: GoogleAdsApi | null = null;

export interface AdsClientConfig {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  refreshToken: string;
}

/**
 * Initialize the Google Ads API client
 */
export function initializeAdsClient(config: AdsClientConfig): GoogleAdsApi {
  adsClient = new GoogleAdsApi({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    developer_token: config.developerToken,
  });

  log.info('Google Ads API client initialized');

  return adsClient;
}

/**
 * Get the Google Ads API client (thread-safe lazy initialization)
 */
export function getAdsClient(): GoogleAdsApi {
  if (adsClient) {
    return adsClient;
  }

  // Try to initialize from environment
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !developerToken || !refreshToken) {
    throw new MCPError({
      code: ErrorCode.AUTH_NOT_CONFIGURED,
      message: 'Google Ads API not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, and GOOGLE_REFRESH_TOKEN environment variables.',
      retryable: false,
      service: 'ads',
    });
  }

  return initializeAdsClient({
    clientId,
    clientSecret,
    developerToken,
    refreshToken,
  });
}

/**
 * Get refresh token from environment
 */
export function getRefreshToken(): string {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new MCPError({
      code: ErrorCode.AUTH_NOT_CONFIGURED,
      message: 'GOOGLE_REFRESH_TOKEN not set',
      retryable: false,
      service: 'ads',
    });
  }
  return refreshToken;
}

/**
 * Get login customer ID (for MCC accounts)
 */
export function getLoginCustomerId(): string | undefined {
  return process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
}
