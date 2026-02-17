/**
 * Google Service Account authentication
 */

import { GoogleAuth, JWT } from 'google-auth-library';
import { getAllScopes } from '../types/google.js';
import { MCPError, ErrorCode } from '../types/errors.js';
import { createServiceLogger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

const log = createServiceLogger('service-account');

export interface ServiceAccountConfig {
  /** Path to service account JSON key file */
  keyFile?: string;
  /** Or provide credentials directly */
  credentials?: {
    client_email: string;
    private_key: string;
    project_id?: string;
  };
  /** Email to impersonate for domain-wide delegation */
  impersonateUser?: string;
}

/**
 * Service Account authentication handler
 */
export class ServiceAccountAuth {
  private config: ServiceAccountConfig;
  private auth: GoogleAuth | null = null;
  private jwtClient: JWT | null = null;
  private credentials: {
    client_email: string;
    private_key: string;
    project_id?: string;
  } | null = null;

  constructor(config: ServiceAccountConfig) {
    this.config = config;
    this.loadCredentials();
  }

  /**
   * Load credentials from file or config
   */
  private loadCredentials(): void {
    if (this.config.credentials) {
      this.credentials = this.config.credentials;
      log.info('Using provided service account credentials');
      return;
    }

    if (this.config.keyFile) {
      const keyPath = path.resolve(this.config.keyFile);

      if (!fs.existsSync(keyPath)) {
        throw MCPError.configError(
          `Service account key file not found: ${keyPath}`
        );
      }

      try {
        const keyContent = fs.readFileSync(keyPath, 'utf8');
        const keyJson = JSON.parse(keyContent);

        this.credentials = {
          client_email: keyJson.client_email,
          private_key: keyJson.private_key,
          project_id: keyJson.project_id,
        };

        log.info('Loaded service account credentials', {
          email: this.credentials.client_email,
          projectId: this.credentials.project_id,
        });
      } catch (error) {
        throw MCPError.configError(
          `Failed to parse service account key file: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  /**
   * Initialize the auth client
   */
  async initialize(): Promise<void> {
    if (!this.credentials) {
      throw MCPError.configError('No service account credentials available');
    }

    const scopes = getAllScopes();

    // Create JWT client
    this.jwtClient = new JWT({
      email: this.credentials.client_email,
      key: this.credentials.private_key,
      scopes,
      subject: this.config.impersonateUser,
    });

    // Also create GoogleAuth for services that use it
    this.auth = new GoogleAuth({
      credentials: {
        client_email: this.credentials.client_email,
        private_key: this.credentials.private_key,
      },
      scopes,
      clientOptions: this.config.impersonateUser
        ? { subject: this.config.impersonateUser }
        : undefined,
    });

    log.info('Service account auth initialized', {
      email: this.credentials.client_email,
      impersonating: this.config.impersonateUser,
      scopes: scopes.length,
    });
  }

  /**
   * Get access token
   */
  async getAccessToken(_service?: string): Promise<string> {
    if (!this.jwtClient) {
      await this.initialize();
    }

    if (!this.jwtClient) {
      throw new MCPError({
        code: ErrorCode.AUTH_NOT_CONFIGURED,
        message: 'Service account not initialized',
        retryable: false,
      });
    }

    try {
      const tokens = await this.jwtClient.authorize();

      if (!tokens.access_token) {
        throw new Error('No access token returned');
      }

      return tokens.access_token;
    } catch (error) {
      log.error('Failed to get access token', {
        error: error instanceof Error ? error : new Error(String(error)),
      });

      throw new MCPError({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: `Service account authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        retryable: true,
      });
    }
  }

  /**
   * Get JWT client for direct API calls
   */
  getJWTClient(): JWT | null {
    return this.jwtClient;
  }

  /**
   * Get GoogleAuth for services that use it
   */
  getGoogleAuth(): GoogleAuth | null {
    return this.auth;
  }

  /**
   * Get credentials info
   */
  getInfo(): { email: string; projectId?: string; impersonating?: string } | null {
    if (!this.credentials) {
      return null;
    }

    return {
      email: this.credentials.client_email,
      projectId: this.credentials.project_id,
      impersonating: this.config.impersonateUser,
    };
  }

  /**
   * Check if configured
   */
  isConfigured(): boolean {
    return !!this.credentials;
  }

  /**
   * Check if authenticated (has valid client)
   */
  isAuthenticated(): boolean {
    return !!this.jwtClient;
  }
}

/** Create service account auth from environment variables */
export async function createServiceAccountFromEnv(): Promise<ServiceAccountAuth | null> {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  const impersonateUser = process.env.GOOGLE_SERVICE_ACCOUNT_IMPERSONATE;

  if (!keyFile) {
    log.debug('Service account not configured - missing key file');
    return null;
  }

  try {
    const auth = new ServiceAccountAuth({
      keyFile,
      impersonateUser,
    });

    // Initialize synchronously during startup
    await auth.initialize();

    return auth;
  } catch (error) {
    log.error('Failed to create service account auth', {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return null;
  }
}

export default ServiceAccountAuth;
