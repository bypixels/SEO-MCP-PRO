/**
 * Token Manager - Handles Google OAuth tokens and automatic refresh
 */

import { OAuth2Client, Credentials } from 'google-auth-library';
import { GoogleService, TokenInfo, GOOGLE_SCOPES, getAllScopes } from '../types/google.js';
import { MCPError, ErrorCode } from '../types/errors.js';
import { createServiceLogger } from '../utils/logger.js';

const log = createServiceLogger('token-manager');

/**
 * Token Manager for handling Google OAuth tokens
 */
export class TokenManager {
  private oauth2Client: OAuth2Client | null = null;
  private tokens: Credentials | null = null;
  private tokenExpiry: Date | null = null;
  private refreshPromise: Promise<void> | null = null;

  /**
   * Initialize with OAuth2 client
   */
  initialize(oauth2Client: OAuth2Client, tokens?: Credentials): void {
    this.oauth2Client = oauth2Client;

    if (tokens) {
      this.setTokens(tokens);
    }

    // Listen for token refresh events
    oauth2Client.on('tokens', (newTokens) => {
      log.info('Tokens refreshed automatically');
      this.setTokens(newTokens);
    });
  }

  /**
   * Set tokens and calculate expiry
   */
  setTokens(tokens: Credentials): void {
    this.tokens = tokens;

    if (tokens.expiry_date) {
      this.tokenExpiry = new Date(tokens.expiry_date);
    } else if (tokens.access_token) {
      // Default to 1 hour if no expiry provided
      this.tokenExpiry = new Date(Date.now() + 3600 * 1000);
    }

    if (this.oauth2Client) {
      this.oauth2Client.setCredentials(tokens);
    }

    log.debug('Tokens updated', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresAt: this.tokenExpiry?.toISOString(),
    });
  }

  /**
   * Get current tokens
   */
  getTokens(): Credentials | null {
    return this.tokens;
  }

  /**
   * Get valid access token (auto-refresh if needed)
   */
  async getAccessToken(service?: GoogleService): Promise<string> {
    if (!this.oauth2Client || !this.tokens) {
      throw new MCPError({
        code: ErrorCode.AUTH_NOT_CONFIGURED,
        message: 'OAuth not configured. Please authenticate first.',
        retryable: false,
      });
    }

    // Check if token is expired or about to expire (5 min buffer)
    const bufferMs = 5 * 60 * 1000;
    const isExpired =
      this.tokenExpiry && this.tokenExpiry.getTime() - bufferMs < Date.now();

    if (isExpired) {
      await this.refreshToken();
    }

    if (!this.tokens.access_token) {
      throw new MCPError({
        code: ErrorCode.AUTH_TOKEN_EXPIRED,
        message: 'Access token not available',
        retryable: true,
      });
    }

    // Verify scopes for the service
    if (service && this.tokens.scope) {
      const requiredScopes = GOOGLE_SCOPES[service];
      if (requiredScopes && requiredScopes.length > 0) {
        const tokenScopes = this.tokens.scope;
        const missingScopes = requiredScopes.filter(
          (scope) => !tokenScopes.includes(scope)
        );

        if (missingScopes.length > 0) {
          throw new MCPError({
            code: ErrorCode.AUTH_INSUFFICIENT_SCOPE,
            message: `Missing required scopes for ${service}: ${missingScopes.join(', ')}. Re-authenticate with the correct scopes.`,
            details: { required: requiredScopes, current: tokenScopes.split(' '), missing: missingScopes },
            retryable: false,
            service,
          });
        }
      }
    }

    return this.tokens.access_token;
  }

  /**
   * Refresh the access token (concurrent calls coalesce into a single refresh)
   */
  async refreshToken(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const promise = this.doRefreshToken().finally(() => {
      this.refreshPromise = null;
    });

    this.refreshPromise = promise;
    return promise;
  }

  /**
   * Internal refresh implementation
   */
  private async doRefreshToken(): Promise<void> {
    if (!this.oauth2Client) {
      throw new MCPError({
        code: ErrorCode.AUTH_NOT_CONFIGURED,
        message: 'OAuth not configured',
        retryable: false,
      });
    }

    if (!this.tokens?.refresh_token) {
      throw new MCPError({
        code: ErrorCode.AUTH_TOKEN_EXPIRED,
        message: 'No refresh token available. Please re-authenticate.',
        retryable: false,
      });
    }

    log.info('Refreshing access token...');

    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.setTokens(credentials);
      log.info('Token refreshed successfully');
    } catch (error) {
      log.error('Token refresh failed', {
        error: error instanceof Error ? error : new Error(String(error)),
      });

      throw new MCPError({
        code: ErrorCode.AUTH_TOKEN_EXPIRED,
        message: `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        retryable: false,
      });
    }
  }

  /**
   * Check if token is valid
   */
  isTokenValid(): boolean {
    if (!this.tokens?.access_token || !this.tokenExpiry) {
      return false;
    }

    // Consider invalid if expiring in less than 1 minute
    return this.tokenExpiry.getTime() - 60000 > Date.now();
  }

  /**
   * Get token info
   */
  getTokenInfo(): TokenInfo | null {
    if (!this.tokens?.access_token || !this.tokenExpiry) {
      return null;
    }

    return {
      accessToken: this.tokens.access_token,
      expiresAt: this.tokenExpiry,
      scopes: this.tokens.scope?.split(' ') || [],
    };
  }

  /**
   * Revoke all tokens
   */
  async revokeAll(): Promise<void> {
    if (!this.oauth2Client || !this.tokens?.access_token) {
      return;
    }

    log.info('Revoking tokens...');

    try {
      await this.oauth2Client.revokeToken(this.tokens.access_token);
      this.tokens = null;
      this.tokenExpiry = null;
      log.info('Tokens revoked successfully');
    } catch (error) {
      log.error('Token revocation failed', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Get the OAuth2 client
   */
  getOAuth2Client(): OAuth2Client | null {
    return this.oauth2Client;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return !!(this.oauth2Client && this.tokens?.access_token);
  }

  /**
   * Get all required scopes
   */
  static getAllScopes(): string[] {
    return getAllScopes();
  }
}

/** Singleton instance */
export const tokenManager = new TokenManager();

export default tokenManager;
