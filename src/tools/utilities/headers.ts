/**
 * HTTP headers analysis tools
 */

import { z } from 'zod';
import { defineTool, fetchUrl, validateUrlInput } from '../base.js';
import { ToolCategory } from '../../types/tools.js';

/** Headers analysis input schema */
const HeadersAnalysisInputSchema = z.object({
  url: z.string().describe('URL to analyze'),
});

type HeadersAnalysisInput = z.infer<typeof HeadersAnalysisInputSchema>;

interface HeaderInfo {
  name: string;
  value: string;
  category: string;
  description: string;
}

interface HeadersAnalysisOutput {
  url: string;
  statusCode: number;
  responseTime: number;
  headers: HeaderInfo[];
  caching: {
    cacheControl?: string;
    expires?: string;
    etag?: string;
    lastModified?: string;
    pragma?: string;
    isCacheable: boolean;
    maxAge?: number;
  };
  compression: {
    contentEncoding?: string;
    acceptEncoding?: string;
    isCompressed: boolean;
  };
  security: {
    hasHSTS: boolean;
    hasCSP: boolean;
    hasXFrameOptions: boolean;
    hasXContentTypeOptions: boolean;
  };
  server: {
    server?: string;
    poweredBy?: string;
    via?: string;
  };
  timing: {
    serverTiming?: string;
    xResponseTime?: string;
  };
  cookies: {
    name: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite?: string;
  }[];
  timestamp: string;
}

// Header descriptions
const HEADER_DESCRIPTIONS: Record<string, { category: string; description: string }> = {
  'content-type': { category: 'Content', description: 'Media type of the response body' },
  'content-length': { category: 'Content', description: 'Size of the response body in bytes' },
  'content-encoding': { category: 'Content', description: 'Compression algorithm used' },
  'content-language': { category: 'Content', description: 'Natural language of the content' },
  'content-disposition': { category: 'Content', description: 'How content should be displayed' },
  'cache-control': { category: 'Caching', description: 'Directives for caching mechanisms' },
  'expires': { category: 'Caching', description: 'Date/time after which response is stale' },
  'etag': { category: 'Caching', description: 'Identifier for a specific version of resource' },
  'last-modified': { category: 'Caching', description: 'Date/time resource was last modified' },
  'pragma': { category: 'Caching', description: 'Implementation-specific caching directives' },
  'vary': { category: 'Caching', description: 'Determines how to match future requests' },
  'age': { category: 'Caching', description: 'Time in seconds since response was generated' },
  'strict-transport-security': { category: 'Security', description: 'Enforces HTTPS connections' },
  'content-security-policy': { category: 'Security', description: 'Controls resources the page can load' },
  'x-frame-options': { category: 'Security', description: 'Controls iframe embedding' },
  'x-content-type-options': { category: 'Security', description: 'Prevents MIME type sniffing' },
  'x-xss-protection': { category: 'Security', description: 'XSS filter configuration (legacy)' },
  'referrer-policy': { category: 'Security', description: 'Controls referrer information sent' },
  'permissions-policy': { category: 'Security', description: 'Controls browser features' },
  'cross-origin-opener-policy': { category: 'Security', description: 'Isolates browsing context' },
  'cross-origin-embedder-policy': { category: 'Security', description: 'Controls embedding' },
  'cross-origin-resource-policy': { category: 'Security', description: 'Controls resource sharing' },
  'server': { category: 'Server', description: 'Server software information' },
  'x-powered-by': { category: 'Server', description: 'Backend technology information' },
  'via': { category: 'Server', description: 'Intermediate proxies' },
  'date': { category: 'Server', description: 'Date/time response was sent' },
  'connection': { category: 'Connection', description: 'Connection options' },
  'keep-alive': { category: 'Connection', description: 'Keep-alive parameters' },
  'transfer-encoding': { category: 'Transfer', description: 'Form of encoding used for transfer' },
  'set-cookie': { category: 'Cookies', description: 'Cookies to be stored by the client' },
  'access-control-allow-origin': { category: 'CORS', description: 'Allowed origins for cross-origin requests' },
  'access-control-allow-methods': { category: 'CORS', description: 'Allowed HTTP methods for CORS' },
  'access-control-allow-headers': { category: 'CORS', description: 'Allowed headers for CORS requests' },
  'access-control-max-age': { category: 'CORS', description: 'How long preflight results can be cached' },
  'x-request-id': { category: 'Debug', description: 'Unique request identifier' },
  'x-correlation-id': { category: 'Debug', description: 'Request correlation ID' },
  'server-timing': { category: 'Performance', description: 'Server-side performance metrics' },
  'x-response-time': { category: 'Performance', description: 'Server response time' },
  'cf-ray': { category: 'CDN', description: 'Cloudflare request identifier' },
  'cf-cache-status': { category: 'CDN', description: 'Cloudflare cache status' },
  'x-cache': { category: 'CDN', description: 'CDN cache status' },
  'x-cdn': { category: 'CDN', description: 'CDN identifier' },
  'x-vercel-id': { category: 'CDN', description: 'Vercel request identifier' },
  'x-amz-cf-id': { category: 'CDN', description: 'CloudFront request identifier' },
  'link': { category: 'Link', description: 'Related resources' },
  'location': { category: 'Redirect', description: 'URL for redirect' },
};

/**
 * Parse Set-Cookie header
 */
function parseCookie(cookieHeader: string): {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
} {
  const parts = cookieHeader.split(';').map(p => p.trim());
  const namePart = parts[0];
  const name = namePart.split('=')[0];

  let secure = false;
  let httpOnly = false;
  let sameSite: string | undefined;

  for (const part of parts.slice(1)) {
    const lower = part.toLowerCase();
    if (lower === 'secure') {
      secure = true;
    } else if (lower === 'httponly') {
      httpOnly = true;
    } else if (lower.startsWith('samesite=')) {
      sameSite = part.split('=')[1];
    }
  }

  return { name, secure, httpOnly, sameSite };
}

/**
 * Parse Cache-Control header
 */
function parseCacheControl(value: string): { maxAge?: number; directives: string[] } {
  const directives = value.split(',').map(d => d.trim().toLowerCase());
  let maxAge: number | undefined;

  for (const directive of directives) {
    if (directive.startsWith('max-age=')) {
      const age = parseInt(directive.split('=')[1], 10);
      if (!isNaN(age)) {
        maxAge = age;
      }
    }
  }

  return { maxAge, directives };
}

/**
 * util_headers_analysis tool
 */
export const headersAnalysisTool = defineTool<HeadersAnalysisInput, HeadersAnalysisOutput>({
  name: 'util_headers_analysis',
  description: 'Analyze HTTP response headers in detail. Provides information about caching, compression, security, cookies, and server configuration.',
  category: 'utilities' as ToolCategory,
  inputSchema: HeadersAnalysisInputSchema,
  cacheTTL: 1800, // 30 minutes
  cacheKeyFn: (input) => input.url,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const result = await fetchUrl(url);

    // Build header info list
    const headers: HeaderInfo[] = [];
    for (const [name, value] of Object.entries(result.headers)) {
      const info = HEADER_DESCRIPTIONS[name] || {
        category: 'Other',
        description: 'Custom or unknown header',
      };
      headers.push({
        name,
        value,
        category: info.category,
        description: info.description,
      });
    }

    // Sort headers by category
    headers.sort((a, b) => a.category.localeCompare(b.category));

    // Parse caching info
    const cacheControl = result.headers['cache-control'];
    const parsedCache = cacheControl ? parseCacheControl(cacheControl) : null;
    const caching = {
      cacheControl,
      expires: result.headers['expires'],
      etag: result.headers['etag'],
      lastModified: result.headers['last-modified'],
      pragma: result.headers['pragma'],
      isCacheable: !!(
        (parsedCache?.maxAge && parsedCache.maxAge > 0) ||
        result.headers['etag'] ||
        result.headers['expires']
      ),
      maxAge: parsedCache?.maxAge,
    };

    // Parse compression info
    const compression = {
      contentEncoding: result.headers['content-encoding'],
      acceptEncoding: result.headers['accept-encoding'],
      isCompressed: !!(
        result.headers['content-encoding'] &&
        ['gzip', 'br', 'deflate'].some(e =>
          result.headers['content-encoding']?.includes(e)
        )
      ),
    };

    // Check security headers
    const security = {
      hasHSTS: !!result.headers['strict-transport-security'],
      hasCSP: !!result.headers['content-security-policy'],
      hasXFrameOptions: !!result.headers['x-frame-options'],
      hasXContentTypeOptions: !!result.headers['x-content-type-options'],
    };

    // Server info
    const server = {
      server: result.headers['server'],
      poweredBy: result.headers['x-powered-by'],
      via: result.headers['via'],
    };

    // Timing info
    const timing = {
      serverTiming: result.headers['server-timing'],
      xResponseTime: result.headers['x-response-time'],
    };

    // Parse cookies
    const cookies: HeadersAnalysisOutput['cookies'] = [];
    const setCookie = result.headers['set-cookie'];
    if (setCookie) {
      // set-cookie can be comma-separated in the normalized headers
      const cookieStrings = setCookie.split(/,(?=[^;]*=)/);
      for (const cookieStr of cookieStrings) {
        cookies.push(parseCookie(cookieStr));
      }
    }

    return {
      url,
      statusCode: result.status,
      responseTime: result.responseTime,
      headers,
      caching,
      compression,
      security,
      server,
      timing,
      cookies,
      timestamp: new Date().toISOString(),
    };
  },
});
