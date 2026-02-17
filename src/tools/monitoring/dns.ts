/**
 * DNS monitoring tools
 */

import { z } from 'zod';
import * as dns from 'dns';
import { promisify } from 'util';
import { defineTool } from '../base.js';
import { ToolCategory } from '../../types/tools.js';
import { MCPError } from '../../types/errors.js';
import { isValidDomain, extractDomain } from '../../utils/validators.js';

// Promisified DNS functions
const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);
const resolveCname = promisify(dns.resolveCname);
const resolveMx = promisify(dns.resolveMx);
const resolveNs = promisify(dns.resolveNs);
const resolveTxt = promisify(dns.resolveTxt);
const resolveSoa = promisify(dns.resolveSoa);

/** DNS lookup input schema */
const DNSLookupInputSchema = z.object({
  domain: z.string().describe('Domain to lookup'),
  recordTypes: z
    .array(z.enum(['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA']))
    .optional()
    .default(['A', 'AAAA', 'MX', 'NS', 'TXT']),
});

type DNSLookupInput = z.infer<typeof DNSLookupInputSchema>;

interface DNSRecord {
  type: string;
  value: string;
  ttl?: number;
  priority?: number;
}

interface DNSLookupOutput {
  domain: string;
  records: DNSRecord[];
  nameservers: string[];
  timestamp: string;
}

/**
 * Resolve DNS records by type
 */
async function resolveRecord(
  domain: string,
  type: string
): Promise<DNSRecord[]> {
  const records: DNSRecord[] = [];

  try {
    switch (type) {
      case 'A': {
        const addresses = await resolve4(domain);
        for (const addr of addresses) {
          records.push({ type: 'A', value: addr });
        }
        break;
      }
      case 'AAAA': {
        const addresses = await resolve6(domain);
        for (const addr of addresses) {
          records.push({ type: 'AAAA', value: addr });
        }
        break;
      }
      case 'CNAME': {
        const cnames = await resolveCname(domain);
        for (const cname of cnames) {
          records.push({ type: 'CNAME', value: cname });
        }
        break;
      }
      case 'MX': {
        const mxRecords = await resolveMx(domain);
        for (const mx of mxRecords) {
          records.push({
            type: 'MX',
            value: mx.exchange,
            priority: mx.priority,
          });
        }
        break;
      }
      case 'NS': {
        const nsRecords = await resolveNs(domain);
        for (const ns of nsRecords) {
          records.push({ type: 'NS', value: ns });
        }
        break;
      }
      case 'TXT': {
        const txtRecords = await resolveTxt(domain);
        for (const txt of txtRecords) {
          records.push({ type: 'TXT', value: txt.join('') });
        }
        break;
      }
      case 'SOA': {
        const soa = await resolveSoa(domain);
        records.push({
          type: 'SOA',
          value: `${soa.nsname} ${soa.hostmaster} (serial: ${soa.serial})`,
        });
        break;
      }
    }
  } catch (error) {
    // Record type not found is not an error, just return empty
    const err = error as { code?: string };
    if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
      // Log other errors but don't fail
    }
  }

  return records;
}

/**
 * monitor_dns_lookup tool
 */
export const dnsLookupTool = defineTool<DNSLookupInput, DNSLookupOutput>({
  name: 'monitor_dns_lookup',
  description: 'Perform DNS lookup for a domain. Returns A, AAAA, MX, NS, TXT, CNAME, and SOA records.',
  category: 'monitoring' as ToolCategory,
  inputSchema: DNSLookupInputSchema,
  cacheTTL: 300, // 5 minutes
  cacheKeyFn: (input) => `${input.domain}:${input.recordTypes?.join(',')}`,

  async handler(input) {
    // Extract domain from URL if needed
    let domain = input.domain;
    if (domain.includes('://')) {
      domain = extractDomain(domain);
    }

    if (!isValidDomain(domain)) {
      throw MCPError.validationError(`Invalid domain: ${domain}`);
    }

    const allRecords: DNSRecord[] = [];
    const nameservers: string[] = [];

    // Resolve each requested record type
    for (const type of input.recordTypes) {
      const records = await resolveRecord(domain, type);
      allRecords.push(...records);

      // Extract nameservers separately
      if (type === 'NS') {
        nameservers.push(...records.map((r) => r.value));
      }
    }

    // If NS wasn't requested, still try to get nameservers
    if (!input.recordTypes.includes('NS') && nameservers.length === 0) {
      try {
        const ns = await resolveNs(domain);
        nameservers.push(...ns);
      } catch {
        // Ignore NS lookup errors
      }
    }

    return {
      domain,
      records: allRecords,
      nameservers,
      timestamp: new Date().toISOString(),
    };
  },
});

/** DNS propagation check input */
const DNSPropagationInputSchema = z.object({
  domain: z.string().describe('Domain to check'),
  recordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT']).default('A'),
  expectedValue: z.string().optional().describe('Expected DNS value to check'),
});

type DNSPropagationInput = z.infer<typeof DNSPropagationInputSchema>;

// Public DNS servers for propagation checking
const DNS_SERVERS = [
  { name: 'Google', ip: '8.8.8.8', location: 'Global' },
  { name: 'Cloudflare', ip: '1.1.1.1', location: 'Global' },
  { name: 'OpenDNS', ip: '208.67.222.222', location: 'US' },
  { name: 'Quad9', ip: '9.9.9.9', location: 'Global' },
];

interface DNSPropagationOutput {
  domain: string;
  recordType: string;
  expectedValue?: string;
  servers: {
    name: string;
    location: string;
    value: string | null;
    matches: boolean;
    responseTime: number;
  }[];
  propagationPercent: number;
  fullyPropagated: boolean;
  timestamp: string;
}

/**
 * Resolve DNS using specific server
 */
async function resolveWithServer(
  domain: string,
  recordType: string,
  server: string
): Promise<{ value: string | null; responseTime: number }> {
  const resolver = new dns.Resolver();
  resolver.setServers([server]);

  const start = Date.now();

  try {
    let result: string[] = [];

    switch (recordType) {
      case 'A':
        result = await promisify(resolver.resolve4.bind(resolver))(domain);
        break;
      case 'AAAA':
        result = await promisify(resolver.resolve6.bind(resolver))(domain);
        break;
      case 'CNAME':
        result = await promisify(resolver.resolveCname.bind(resolver))(domain);
        break;
      case 'MX': {
        const mx = await promisify(resolver.resolveMx.bind(resolver))(domain);
        result = mx.map((m) => m.exchange);
        break;
      }
      case 'NS':
        result = await promisify(resolver.resolveNs.bind(resolver))(domain);
        break;
      case 'TXT': {
        const txt = await promisify(resolver.resolveTxt.bind(resolver))(domain);
        result = txt.map((t) => t.join(''));
        break;
      }
    }

    return {
      value: result.length > 0 ? result[0] : null,
      responseTime: Date.now() - start,
    };
  } catch {
    return {
      value: null,
      responseTime: Date.now() - start,
    };
  }
}

/**
 * monitor_dns_propagation tool
 */
export const dnsPropagationTool = defineTool<DNSPropagationInput, DNSPropagationOutput>({
  name: 'monitor_dns_propagation',
  description: 'Check DNS propagation across multiple public DNS servers (Google, Cloudflare, OpenDNS, Quad9).',
  category: 'monitoring' as ToolCategory,
  inputSchema: DNSPropagationInputSchema,

  async handler(input) {
    let domain = input.domain;
    if (domain.includes('://')) {
      domain = extractDomain(domain);
    }

    if (!isValidDomain(domain)) {
      throw MCPError.validationError(`Invalid domain: ${domain}`);
    }

    const results = await Promise.all(
      DNS_SERVERS.map(async (server) => {
        const { value, responseTime } = await resolveWithServer(
          domain,
          input.recordType,
          server.ip
        );

        return {
          name: server.name,
          location: server.location,
          value,
          matches: input.expectedValue
            ? value === input.expectedValue
            : value !== null,
          responseTime,
        };
      })
    );

    const matchingCount = results.filter((r) => r.matches).length;
    const propagationPercent = Math.round((matchingCount / results.length) * 100);

    return {
      domain,
      recordType: input.recordType,
      expectedValue: input.expectedValue,
      servers: results,
      propagationPercent,
      fullyPropagated: propagationPercent === 100,
      timestamp: new Date().toISOString(),
    };
  },
});
