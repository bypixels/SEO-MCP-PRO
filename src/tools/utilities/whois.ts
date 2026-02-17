/**
 * WHOIS lookup tools
 */

import { z } from 'zod';
import * as net from 'net';
import { defineTool } from '../base.js';
import { ToolCategory } from '../../types/tools.js';
import { MCPError } from '../../types/errors.js';
import { isValidDomain, extractDomain } from '../../utils/validators.js';

/** WHOIS lookup input schema */
const WhoisLookupInputSchema = z.object({
  domain: z.string().describe('Domain to lookup'),
});

type WhoisLookupInput = z.infer<typeof WhoisLookupInputSchema>;

interface WhoisData {
  domainName?: string;
  registrar?: string;
  registrarUrl?: string;
  createdDate?: string;
  updatedDate?: string;
  expiryDate?: string;
  nameServers?: string[];
  status?: string[];
  registrant?: {
    organization?: string;
    country?: string;
    state?: string;
  };
  dnssec?: string;
}

interface WhoisLookupOutput {
  domain: string;
  available: boolean;
  data?: WhoisData;
  raw: string;
  timestamp: string;
}

// WHOIS servers by TLD
const WHOIS_SERVERS: Record<string, string> = {
  com: 'whois.verisign-grs.com',
  net: 'whois.verisign-grs.com',
  org: 'whois.pir.org',
  io: 'whois.nic.io',
  co: 'whois.nic.co',
  ai: 'whois.nic.ai',
  dev: 'whois.nic.google',
  app: 'whois.nic.google',
  info: 'whois.afilias.net',
  biz: 'whois.biz',
  me: 'whois.nic.me',
  tv: 'tvwhois.verisign-grs.com',
  cc: 'ccwhois.verisign-grs.com',
  uk: 'whois.nic.uk',
  de: 'whois.denic.de',
  fr: 'whois.nic.fr',
  nl: 'whois.domain-registry.nl',
  eu: 'whois.eu',
  au: 'whois.auda.org.au',
  ca: 'whois.cira.ca',
  xyz: 'whois.nic.xyz',
  online: 'whois.nic.online',
  site: 'whois.nic.site',
  tech: 'whois.nic.tech',
};

/**
 * Get WHOIS server for domain
 */
function getWhoisServer(domain: string): string {
  const parts = domain.split('.');
  const tld = parts[parts.length - 1].toLowerCase();

  // Check for two-part TLDs like co.uk
  if (parts.length >= 2) {
    const twoPartTld = `${parts[parts.length - 2]}.${tld}`;
    if (WHOIS_SERVERS[twoPartTld]) {
      return WHOIS_SERVERS[twoPartTld];
    }
  }

  return WHOIS_SERVERS[tld] || 'whois.iana.org';
}

/**
 * Query WHOIS server
 */
async function queryWhois(domain: string, server: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let data = '';

    socket.setTimeout(10000);

    socket.connect(43, server, () => {
      // Some servers need domain=
      if (server.includes('denic')) {
        socket.write(`-T dn,ace ${domain}\r\n`);
      } else {
        socket.write(`${domain}\r\n`);
      }
    });

    socket.on('data', (chunk) => {
      data += chunk.toString();
    });

    socket.on('end', () => {
      resolve(data);
    });

    socket.on('error', (err) => {
      reject(err);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

/**
 * Parse WHOIS response
 */
function parseWhoisResponse(raw: string): { available: boolean; data?: WhoisData } {
  // Check if domain is available
  const availablePatterns = [
    /no match/i,
    /not found/i,
    /no data found/i,
    /available/i,
    /status:\s*free/i,
    /domain not found/i,
  ];

  for (const pattern of availablePatterns) {
    if (pattern.test(raw)) {
      return { available: true };
    }
  }

  const data: WhoisData = {};
  const lines = raw.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();

    if (!value) continue;

    switch (key) {
      case 'domain name':
        data.domainName = value;
        break;
      case 'registrar':
      case 'registrar name':
      case 'sponsoring registrar':
        data.registrar = value;
        break;
      case 'registrar url':
        data.registrarUrl = value;
        break;
      case 'creation date':
      case 'created':
      case 'created date':
      case 'registration date':
        data.createdDate = value;
        break;
      case 'updated date':
      case 'last updated':
      case 'last modified':
        data.updatedDate = value;
        break;
      case 'registry expiry date':
      case 'expiration date':
      case 'expiry date':
      case 'paid-till':
        data.expiryDate = value;
        break;
      case 'name server':
      case 'nserver':
        if (!data.nameServers) data.nameServers = [];
        data.nameServers.push(value.toLowerCase());
        break;
      case 'domain status':
      case 'status':
        if (!data.status) data.status = [];
        data.status.push(value);
        break;
      case 'registrant organization':
      case 'registrant':
        if (!data.registrant) data.registrant = {};
        data.registrant.organization = value;
        break;
      case 'registrant country':
        if (!data.registrant) data.registrant = {};
        data.registrant.country = value;
        break;
      case 'registrant state/province':
        if (!data.registrant) data.registrant = {};
        data.registrant.state = value;
        break;
      case 'dnssec':
        data.dnssec = value;
        break;
    }
  }

  return { available: false, data };
}

/**
 * util_whois_lookup tool
 */
export const whoisLookupTool = defineTool<WhoisLookupInput, WhoisLookupOutput>({
  name: 'util_whois_lookup',
  description: 'Look up WHOIS information for a domain. Returns registrar, creation date, expiry date, name servers, and domain status.',
  category: 'utilities' as ToolCategory,
  inputSchema: WhoisLookupInputSchema,
  cacheTTL: 86400, // 24 hours
  cacheKeyFn: (input) => input.domain,

  async handler(input) {
    let domain = input.domain;

    // Extract domain from URL if needed
    if (domain.includes('://')) {
      domain = extractDomain(domain);
    }

    // Remove www prefix
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }

    if (!isValidDomain(domain)) {
      throw MCPError.validationError(`Invalid domain: ${domain}`);
    }

    const server = getWhoisServer(domain);

    try {
      let raw = await queryWhois(domain, server);

      // For Verisign servers, we need to follow to the registrar WHOIS
      if (server.includes('verisign') && raw.includes('Registrar WHOIS Server:')) {
        const match = raw.match(/Registrar WHOIS Server:\s*(\S+)/i);
        if (match) {
          try {
            const registrarRaw = await queryWhois(domain, match[1]);
            raw = registrarRaw + '\n---\n' + raw;
          } catch {
            // Keep original response if registrar lookup fails
          }
        }
      }

      const { available, data } = parseWhoisResponse(raw);

      return {
        domain,
        available,
        data,
        raw,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw MCPError.externalServiceError(
        domain,
        error instanceof Error ? error.message : 'WHOIS lookup failed'
      );
    }
  },
});
