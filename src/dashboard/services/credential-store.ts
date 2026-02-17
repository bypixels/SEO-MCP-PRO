/**
 * Encrypted credential store
 *
 * Persists user API keys in an AES-256-GCM encrypted JSON file.
 * Credentials are shared between MCP (stdio) and Dashboard (HTTP).
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { hostname } from 'node:os';
import { createServiceLogger } from '../../utils/logger.js';

const log = createServiceLogger('credential-store');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = 'website-ops-mcp-credential-store';

/** Credential groups and their env var mappings */
export const CREDENTIAL_SCHEMA: Record<string, { envVar: string; label: string; secret: boolean }> = {
  // Google OAuth
  google_client_id:               { envVar: 'GOOGLE_CLIENT_ID',               label: 'Google OAuth Client ID',       secret: false },
  google_client_secret:           { envVar: 'GOOGLE_CLIENT_SECRET',           label: 'Google OAuth Client Secret',   secret: true },
  google_redirect_uri:            { envVar: 'GOOGLE_REDIRECT_URI',            label: 'Google OAuth Redirect URI',    secret: false },
  google_refresh_token:           { envVar: 'GOOGLE_REFRESH_TOKEN',           label: 'Google OAuth Refresh Token',   secret: true },

  // Google Service Account
  google_service_account_key_file:      { envVar: 'GOOGLE_SERVICE_ACCOUNT_KEY_FILE',      label: 'Service Account Key File Path', secret: false },
  google_service_account_impersonate:   { envVar: 'GOOGLE_SERVICE_ACCOUNT_IMPERSONATE',   label: 'Impersonate Email (optional)',   secret: false },

  // Google API Keys
  google_pagespeed_api_key:       { envVar: 'GOOGLE_PAGESPEED_API_KEY',       label: 'PageSpeed Insights API Key',   secret: true },
  google_safe_browsing_api_key:   { envVar: 'GOOGLE_SAFE_BROWSING_API_KEY',   label: 'Safe Browsing API Key',        secret: true },

  // Google Ads
  google_ads_developer_token:     { envVar: 'GOOGLE_ADS_DEVELOPER_TOKEN',     label: 'Google Ads Developer Token',   secret: true },
  google_ads_login_customer_id:   { envVar: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',   label: 'Google Ads Login Customer ID', secret: false },

  // Cloudflare
  cloudflare_api_token:           { envVar: 'CLOUDFLARE_API_TOKEN',           label: 'Cloudflare API Token',         secret: true },
  cloudflare_email:               { envVar: 'CLOUDFLARE_EMAIL',               label: 'Cloudflare Email',             secret: false },
  cloudflare_api_key:             { envVar: 'CLOUDFLARE_API_KEY',             label: 'Cloudflare API Key (legacy)',   secret: true },
};

/** Service groups for UI display */
export const CREDENTIAL_GROUPS = [
  {
    id: 'google_oauth',
    label: 'Google OAuth 2.0',
    description: 'For user-specific access to Google APIs (GTM, GA4, Search Console, etc.)',
    keys: ['google_client_id', 'google_client_secret', 'google_redirect_uri', 'google_refresh_token'],
  },
  {
    id: 'google_service_account',
    label: 'Google Service Account',
    description: 'For server-to-server access with optional domain-wide delegation',
    keys: ['google_service_account_key_file', 'google_service_account_impersonate'],
  },
  {
    id: 'google_api_keys',
    label: 'Google API Keys',
    description: 'For public Google APIs (PageSpeed, Safe Browsing)',
    keys: ['google_pagespeed_api_key', 'google_safe_browsing_api_key'],
  },
  {
    id: 'google_ads',
    label: 'Google Ads',
    description: 'For Google Ads API access',
    keys: ['google_ads_developer_token', 'google_ads_login_customer_id'],
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    description: 'For Cloudflare DNS, analytics, and firewall tools',
    keys: ['cloudflare_api_token', 'cloudflare_email', 'cloudflare_api_key'],
  },
];

export type StoredCredentials = Record<string, string>;

interface EncryptedFile {
  iv: string;   // hex
  tag: string;  // hex
  data: string; // hex
}

/**
 * Derive encryption key from a passphrase
 */
function deriveKey(passphrase: string): Buffer {
  return scryptSync(passphrase, SALT, KEY_LENGTH);
}

/**
 * Get the encryption passphrase.
 * Uses CREDENTIAL_ENCRYPTION_KEY env var, falls back to DASHBOARD_API_KEY,
 * or generates a machine-stable key from username + hostname.
 */
function getPassphrase(): string {
  return process.env.CREDENTIAL_ENCRYPTION_KEY
    || process.env.DASHBOARD_API_KEY
    || `website-ops-${process.env.USER || 'default'}-${hostname()}`;
}

function encrypt(plaintext: string): EncryptedFile {
  const key = deriveKey(getPassphrase());
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted,
  };
}

function decrypt(file: EncryptedFile): string {
  const key = deriveKey(getPassphrase());
  const iv = Buffer.from(file.iv, 'hex');
  const tag = Buffer.from(file.tag, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(file.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Credential Store — manages encrypted persistence of API keys
 */
class CredentialStore {
  private credentials: StoredCredentials = {};
  private filePath: string;

  constructor() {
    // Store in project root by default, configurable via env
    const storeDir = process.env.CREDENTIAL_STORE_PATH || process.cwd();
    this.filePath = join(storeDir, '.website-ops-credentials.enc');
  }

  /**
   * Load credentials from encrypted file (if exists)
   */
  load(): StoredCredentials {
    if (!existsSync(this.filePath)) {
      log.debug('No credential file found, starting fresh');
      this.credentials = {};
      return this.credentials;
    }

    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const encrypted: EncryptedFile = JSON.parse(raw);
      const decrypted = decrypt(encrypted);
      this.credentials = JSON.parse(decrypted);
      log.info('Credentials loaded', { count: Object.keys(this.credentials).length });
    } catch (error) {
      log.error('Failed to load credentials — file may be corrupted or key changed', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.credentials = {};
    }

    return this.credentials;
  }

  /**
   * Save current credentials to encrypted file
   */
  private save(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const plaintext = JSON.stringify(this.credentials);
      const encrypted = encrypt(plaintext);
      writeFileSync(this.filePath, JSON.stringify(encrypted), 'utf-8');
      log.info('Credentials saved', { count: Object.keys(this.credentials).length });
    } catch (error) {
      log.error('Failed to save credentials', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Get a credential value
   */
  get(key: string): string | undefined {
    return this.credentials[key];
  }

  /**
   * Get all credentials (full map)
   */
  getAll(): StoredCredentials {
    return { ...this.credentials };
  }

  /**
   * Set one or more credentials and persist
   */
  set(updates: StoredCredentials): void {
    for (const [key, value] of Object.entries(updates)) {
      if (value && value.trim()) {
        this.credentials[key] = value.trim();
      } else {
        // Empty value means remove
        delete this.credentials[key];
      }
    }
    this.save();
  }

  /**
   * Remove a credential
   */
  remove(key: string): void {
    delete this.credentials[key];
    this.save();
  }

  /**
   * Clear all credentials
   */
  clear(): void {
    this.credentials = {};
    this.save();
  }

  /**
   * Get status: which keys are configured (names only, not values)
   */
  getStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const key of Object.keys(CREDENTIAL_SCHEMA)) {
      status[key] = !!this.credentials[key];
    }
    return status;
  }

  /**
   * Apply stored credentials to process.env so existing auth system picks them up
   */
  applyToEnv(): void {
    let applied = 0;
    for (const [key, schema] of Object.entries(CREDENTIAL_SCHEMA)) {
      const value = this.credentials[key];
      if (value) {
        process.env[schema.envVar] = value;
        applied++;
      }
    }
    if (applied > 0) {
      log.info('Applied credentials to environment', { count: applied });
    }
  }
}

/** Singleton */
export const credentialStore = new CredentialStore();
