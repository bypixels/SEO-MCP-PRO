/**
 * Google OAuth 2.0 authentication
 */

import { OAuth2Client, Credentials } from 'google-auth-library';
import { getAllScopes } from '../types/google.js';
import { MCPError, ErrorCode } from '../types/errors.js';
import { createServiceLogger } from '../utils/logger.js';
import { tokenManager } from './token-manager.js';

const log = createServiceLogger('google-oauth');

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
}

/**
 * Google OAuth handler
 */
export class GoogleOAuth {
  private oauth2Client: OAuth2Client;

  constructor(config: OAuthConfig) {
    this.oauth2Client = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    log.info('OAuth client initialized');
  }

  /**
   * Initialize with existing refresh token
   */
  async initializeWithRefreshToken(refreshToken: string): Promise<void> {
    log.info('Initializing OAuth with refresh token');

    const credentials: Credentials = {
      refresh_token: refreshToken,
    };

    this.oauth2Client.setCredentials(credentials);
    tokenManager.initialize(this.oauth2Client, credentials);

    // Force initial refresh to get access token
    await tokenManager.refreshToken();
  }

  /**
   * Generate authorization URL
   */
  generateAuthUrl(options?: {
    accessType?: 'online' | 'offline';
    prompt?: 'none' | 'consent' | 'select_account';
    state?: string;
  }): string {
    const scopes = getAllScopes();

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: options?.accessType || 'offline',
      scope: scopes,
      prompt: options?.prompt || 'consent',
      state: options?.state,
      include_granted_scopes: true,
    });

    log.info('Generated auth URL', { scopes: scopes.length });

    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string): Promise<Credentials> {
    log.info('Exchanging authorization code for tokens');

    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        log.warn(
          'No refresh token received. User may need to re-consent with prompt=consent'
        );
      }

      this.oauth2Client.setCredentials(tokens);
      tokenManager.initialize(this.oauth2Client, tokens);

      log.info('Token exchange successful', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
      });

      return tokens;
    } catch (error) {
      log.error('Token exchange failed', {
        error: error instanceof Error ? error : new Error(String(error)),
      });

      throw new MCPError({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: `Token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        retryable: false,
      });
    }
  }

  /**
   * Get the OAuth2 client
   */
  getClient(): OAuth2Client {
    return this.oauth2Client;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return tokenManager.isAuthenticated();
  }

  /**
   * Get token info
   */
  getTokenInfo() {
    return tokenManager.getTokenInfo();
  }

  /**
   * Revoke access
   */
  async revoke(): Promise<void> {
    await tokenManager.revokeAll();
  }
}

/** Create OAuth client from environment variables */
export async function createOAuthFromEnv(): Promise<GoogleOAuth | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback';

  if (!clientId || !clientSecret) {
    log.debug('OAuth not configured - missing client credentials');
    return null;
  }

  const oauth = new GoogleOAuth({
    clientId,
    clientSecret,
    redirectUri,
  });

  // Initialize with refresh token if available
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (refreshToken) {
    await oauth.initializeWithRefreshToken(refreshToken);
  }

  return oauth;
}

export default GoogleOAuth;
