/**
 * Input validation utilities
 */

import { z } from 'zod';
import { MCPError, ErrorCode } from '../types/errors.js';

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and normalize URL
 */
export function normalizeUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  const parsed = new URL(url);
  return parsed.href;
}

/**
 * Validate domain format
 */
export function isValidDomain(domain: string): boolean {
  const domainRegex =
    /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.hostname;
  } catch {
    return url;
  }
}

/**
 * Validate date format (YYYY-MM-DD or relative)
 */
export function isValidDate(date: string): boolean {
  // Relative dates
  if (['today', 'yesterday'].includes(date)) {
    return true;
  }
  if (/^\d+daysAgo$/i.test(date)) {
    return true;
  }

  // ISO date
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRegex.test(date)) {
    return false;
  }

  const parsed = new Date(date);
  return !isNaN(parsed.getTime());
}

/**
 * Convert relative date to ISO format
 */
export function resolveDate(date: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date === 'today') {
    return formatDate(today);
  }

  if (date === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatDate(yesterday);
  }

  const daysAgoMatch = date.match(/^(\d+)daysAgo$/i);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1], 10);
    const past = new Date(today);
    past.setDate(past.getDate() - days);
    return formatDate(past);
  }

  return date;
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Validate date range
 */
export function validateDateRange(
  startDate: string,
  endDate: string
): { start: string; end: string } {
  const start = resolveDate(startDate);
  const end = resolveDate(endDate);

  const startParsed = new Date(start);
  const endParsed = new Date(end);

  if (isNaN(startParsed.getTime())) {
    throw MCPError.validationError(`Invalid start date: ${startDate}`);
  }

  if (isNaN(endParsed.getTime())) {
    throw MCPError.validationError(`Invalid end date: ${endDate}`);
  }

  if (startParsed > endParsed) {
    throw MCPError.validationError('Start date must be before end date');
  }

  return { start, end };
}

/**
 * Validate input with Zod schema
 */
export function validateInput<T>(
  schema: z.ZodType<T>,
  input: unknown
): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    const errors = result.error.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message,
    }));

    throw new MCPError({
      code: ErrorCode.INVALID_INPUT,
      message: 'Validation failed',
      details: { errors },
      retryable: false,
    });
  }

  return result.data;
}

/**
 * Common Zod schemas
 */
export const schemas = {
  url: z.string().refine(isValidUrl, { message: 'Invalid URL format' }),

  domain: z.string().refine(isValidDomain, { message: 'Invalid domain format' }),

  date: z.string().refine(isValidDate, {
    message: 'Invalid date format. Use YYYY-MM-DD, today, yesterday, or NdaysAgo',
  }),

  dateRange: z.object({
    startDate: z.string().refine(isValidDate, { message: 'Invalid start date' }),
    endDate: z.string().refine(isValidDate, { message: 'Invalid end date' }),
  }),

  pagination: z.object({
    pageSize: z.number().min(1).max(200).optional().default(100),
    pageToken: z.string().optional(),
  }),

  googlePropertyId: z.string().regex(/^\d+$/, {
    message: 'Property ID must be numeric',
  }),

  googleAccountId: z.string().regex(/^\d+$/, {
    message: 'Account ID must be numeric',
  }),

  email: z.string().email({ message: 'Invalid email format' }),

  positiveInt: z.number().int().positive(),

  nonEmptyString: z.string().min(1, { message: 'Value cannot be empty' }),
};

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

/**
 * Validate GA4 property ID format
 */
export function validatePropertyId(propertyId: string): string {
  // Remove 'properties/' prefix if present
  const id = propertyId.replace(/^properties\//, '');

  if (!/^\d+$/.test(id)) {
    throw MCPError.validationError(`Invalid property ID: ${propertyId}`);
  }

  return id;
}

/**
 * Validate GSC site URL format
 */
export function validateSiteUrl(siteUrl: string): string {
  // GSC accepts URLs with or without trailing slash
  // and sc-domain: prefix for domain properties
  if (siteUrl.startsWith('sc-domain:')) {
    const domain = siteUrl.replace('sc-domain:', '');
    if (!isValidDomain(domain)) {
      throw MCPError.validationError(`Invalid domain in site URL: ${siteUrl}`);
    }
    return siteUrl;
  }

  if (!isValidUrl(siteUrl)) {
    throw MCPError.validationError(`Invalid site URL: ${siteUrl}`);
  }

  return siteUrl;
}
