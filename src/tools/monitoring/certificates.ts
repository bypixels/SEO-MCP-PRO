/**
 * SSL Certificate monitoring tools
 */

import { z } from 'zod';
import * as tls from 'tls';
import { defineTool } from '../base.js';
import { ToolCategory } from '../../types/tools.js';
import { MCPError } from '../../types/errors.js';
import { isValidDomain, extractDomain } from '../../utils/validators.js';

/** Certificate check input schema */
const CertificateCheckInputSchema = z.object({
  hostname: z.string().describe('Hostname to check'),
  port: z.number().min(1).max(65535).optional().default(443),
});

type CertificateCheckInput = z.infer<typeof CertificateCheckInputSchema>;

interface CertificateCheckOutput {
  hostname: string;
  port: number;
  valid: boolean;
  issuer: {
    commonName: string;
    organization: string;
    country?: string;
  };
  subject: {
    commonName: string;
    alternativeNames: string[];
    organization?: string;
  };
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  protocol: string;
  serialNumber: string;
  fingerprint: string;
  chain: {
    subject: string;
    issuer: string;
    validTo: string;
  }[];
  issues: string[];
  timestamp: string;
}

/**
 * Get detailed certificate information
 */
async function getCertificateDetails(
  hostname: string,
  port: number
): Promise<CertificateCheckOutput> {
  return new Promise((resolve, reject) => {
    const issues: string[] = [];

    const options = {
      host: hostname,
      port,
      servername: hostname,
      rejectUnauthorized: false, // We want to inspect even invalid certs
      requestCert: true,
    };

    const socket = tls.connect(options, () => {
      const cert = socket.getPeerCertificate(true);
      const authorized = socket.authorized;
      const protocol = socket.getProtocol() || 'unknown';
      socket.getCipher(); // Available for future use

      socket.destroy();

      if (!cert || Object.keys(cert).length === 0) {
        reject(new Error('No certificate returned'));
        return;
      }

      // Calculate expiry
      const validFrom = new Date(cert.valid_from);
      const validTo = new Date(cert.valid_to);
      const now = new Date();
      const daysUntilExpiry = Math.floor(
        (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Check for issues
      if (!authorized) {
        issues.push(`Certificate not trusted: ${socket.authorizationError}`);
      }

      if (daysUntilExpiry <= 0) {
        issues.push('Certificate has expired');
      } else if (daysUntilExpiry <= 7) {
        issues.push(`Certificate expires in ${daysUntilExpiry} days (critical)`);
      } else if (daysUntilExpiry <= 30) {
        issues.push(`Certificate expires in ${daysUntilExpiry} days (warning)`);
      }

      // Check for weak protocols
      if (protocol === 'TLSv1' || protocol === 'TLSv1.1') {
        issues.push(`Weak TLS version: ${protocol}`);
      }

      // Extract SANs
      const alternativeNames: string[] = [];
      if (cert.subjectaltname) {
        const sans = cert.subjectaltname.split(', ');
        for (const san of sans) {
          if (san.startsWith('DNS:')) {
            alternativeNames.push(san.substring(4));
          }
        }
      }

      // Check hostname match
      const validNames = [cert.subject?.CN, ...alternativeNames].filter(Boolean);
      const hostnameMatches = validNames.some((name) => {
        if (name?.startsWith('*.')) {
          // Wildcard match
          const pattern = name.substring(2);
          const parts = hostname.split('.');
          const patternParts = pattern.split('.');
          return (
            parts.length === patternParts.length + 1 &&
            parts.slice(1).join('.') === pattern
          );
        }
        return name === hostname;
      });

      if (!hostnameMatches) {
        issues.push(`Hostname mismatch: certificate is for ${validNames.join(', ')}`);
      }

      // Build certificate chain
      const chain: CertificateCheckOutput['chain'] = [];
      let currentCert = cert;
      const seenSerials = new Set<string>();

      while (currentCert && !seenSerials.has(currentCert.serialNumber)) {
        seenSerials.add(currentCert.serialNumber);
        chain.push({
          subject: currentCert.subject?.CN || 'Unknown',
          issuer: currentCert.issuer?.CN || 'Unknown',
          validTo: new Date(currentCert.valid_to).toISOString(),
        });

        const issuerCert = (currentCert as tls.DetailedPeerCertificate).issuerCertificate;
        if (issuerCert && issuerCert !== currentCert) {
          currentCert = issuerCert;
        } else {
          break;
        }
      }

      resolve({
        hostname,
        port,
        valid: authorized && daysUntilExpiry > 0,
        issuer: {
          commonName: cert.issuer?.CN || 'Unknown',
          organization: cert.issuer?.O || 'Unknown',
          country: cert.issuer?.C,
        },
        subject: {
          commonName: cert.subject?.CN || 'Unknown',
          alternativeNames,
          organization: cert.subject?.O,
        },
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        daysUntilExpiry,
        protocol,
        serialNumber: cert.serialNumber,
        fingerprint: cert.fingerprint256 || cert.fingerprint || 'Unknown',
        chain,
        issues,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('error', (error) => {
      reject(new Error(`Connection failed: ${error.message}`));
    });

    socket.setTimeout(10000, () => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

/**
 * monitor_certificate tool
 */
export const certificateTool = defineTool<CertificateCheckInput, CertificateCheckOutput>({
  name: 'monitor_certificate',
  description: 'Check SSL/TLS certificate details including validity, expiration, issuer, and certificate chain.',
  category: 'monitoring' as ToolCategory,
  inputSchema: CertificateCheckInputSchema,
  cacheTTL: 3600, // 1 hour
  cacheKeyFn: (input) => `${input.hostname}:${input.port}`,

  async handler(input) {
    // Extract hostname from URL if needed
    let hostname = input.hostname;
    if (hostname.includes('://')) {
      hostname = extractDomain(hostname);
    }

    // Remove port from hostname if present
    if (hostname.includes(':')) {
      hostname = hostname.split(':')[0];
    }

    if (!isValidDomain(hostname)) {
      throw MCPError.validationError(`Invalid hostname: ${hostname}`);
    }

    try {
      return await getCertificateDetails(hostname, input.port);
    } catch (error) {
      throw MCPError.externalServiceError(
        hostname,
        error instanceof Error ? error.message : 'Certificate check failed'
      );
    }
  },
});
