/**
 * SSL/TLS security analysis tools
 */

import { z } from 'zod';
import * as tls from 'tls';
import { defineTool } from '../base.js';
import { ToolCategory } from '../../types/tools.js';
import { MCPError } from '../../types/errors.js';
import { isValidDomain, extractDomain } from '../../utils/validators.js';

/** SSL analysis input schema */
const SSLAnalyzeInputSchema = z.object({
  hostname: z.string().describe('Hostname to analyze'),
  port: z.number().min(1).max(65535).optional().default(443),
});

type SSLAnalyzeInput = z.infer<typeof SSLAnalyzeInputSchema>;

interface CipherInfo {
  name: string;
  version: string;
  bits: number;
}

interface ProtocolSupport {
  protocol: string;
  supported: boolean;
  reason?: string;
}

interface SSLAnalyzeOutput {
  hostname: string;
  port: number;
  grade: string;
  certificate: {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    daysUntilExpiry: number;
    serialNumber: string;
    fingerprint: string;
    signatureAlgorithm: string;
    keySize?: number;
    alternativeNames: string[];
  };
  protocols: ProtocolSupport[];
  cipher: CipherInfo;
  vulnerabilities: {
    name: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    description: string;
  }[];
  recommendations: string[];
  timestamp: string;
}

// Known weak ciphers
const WEAK_CIPHERS = [
  'RC4',
  'DES',
  '3DES',
  'MD5',
  'NULL',
  'EXPORT',
  'anon',
];

// Protocol test configurations
const PROTOCOLS_TO_TEST = [
  { name: 'TLSv1.3', minVersion: 'TLSv1.3' as const, maxVersion: 'TLSv1.3' as const },
  { name: 'TLSv1.2', minVersion: 'TLSv1.2' as const, maxVersion: 'TLSv1.2' as const },
  { name: 'TLSv1.1', minVersion: 'TLSv1.1' as const, maxVersion: 'TLSv1.1' as const },
  { name: 'TLSv1', minVersion: 'TLSv1' as const, maxVersion: 'TLSv1' as const },
];

/**
 * Test if a specific protocol is supported
 */
async function testProtocol(
  hostname: string,
  port: number,
  protocol: { name: string; minVersion: tls.SecureVersion; maxVersion: tls.SecureVersion }
): Promise<ProtocolSupport> {
  return new Promise((resolve) => {
    try {
      const options: tls.ConnectionOptions = {
        host: hostname,
        port,
        servername: hostname,
        rejectUnauthorized: false,
        minVersion: protocol.minVersion,
        maxVersion: protocol.maxVersion,
      };

      const socket = tls.connect(options, () => {
        const actualProtocol = socket.getProtocol();
        socket.destroy();
        resolve({
          protocol: protocol.name,
          supported: actualProtocol === protocol.name,
        });
      });

      socket.on('error', (error) => {
        resolve({
          protocol: protocol.name,
          supported: false,
          reason: error.message,
        });
      });

      socket.setTimeout(5000, () => {
        socket.destroy();
        resolve({
          protocol: protocol.name,
          supported: false,
          reason: 'Timeout',
        });
      });
    } catch (error) {
      resolve({
        protocol: protocol.name,
        supported: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * Calculate SSL grade based on analysis
 */
function calculateGrade(
  protocols: ProtocolSupport[],
  cipher: CipherInfo,
  daysUntilExpiry: number,
  vulnerabilities: SSLAnalyzeOutput['vulnerabilities']
): string {
  let score = 100;

  // Deduct for protocol support issues
  const tls13 = protocols.find(p => p.protocol === 'TLSv1.3');
  const tls12 = protocols.find(p => p.protocol === 'TLSv1.2');
  const tls11 = protocols.find(p => p.protocol === 'TLSv1.1');
  const tls10 = protocols.find(p => p.protocol === 'TLSv1');

  if (!tls13?.supported && !tls12?.supported) {
    score -= 30; // No modern TLS
  }
  if (tls11?.supported) {
    score -= 10; // Deprecated protocol
  }
  if (tls10?.supported) {
    score -= 15; // Deprecated protocol
  }

  // Deduct for weak ciphers
  if (WEAK_CIPHERS.some(weak => cipher.name.includes(weak))) {
    score -= 20;
  }

  // Deduct for cipher bit strength
  if (cipher.bits < 128) {
    score -= 25;
  } else if (cipher.bits < 256) {
    score -= 5;
  }

  // Deduct for certificate expiry
  if (daysUntilExpiry <= 0) {
    score -= 50;
  } else if (daysUntilExpiry <= 7) {
    score -= 20;
  } else if (daysUntilExpiry <= 30) {
    score -= 10;
  }

  // Deduct for vulnerabilities
  for (const vuln of vulnerabilities) {
    switch (vuln.severity) {
      case 'critical':
        score -= 30;
        break;
      case 'high':
        score -= 20;
        break;
      case 'medium':
        score -= 10;
        break;
      case 'low':
        score -= 5;
        break;
    }
  }

  // Convert score to grade
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 55) return 'C-';
  if (score >= 50) return 'D';
  return 'F';
}

/**
 * Analyze SSL configuration
 */
async function analyzeSSL(
  hostname: string,
  port: number
): Promise<SSLAnalyzeOutput> {
  return new Promise((resolve, reject) => {
    const vulnerabilities: SSLAnalyzeOutput['vulnerabilities'] = [];
    const recommendations: string[] = [];

    const options = {
      host: hostname,
      port,
      servername: hostname,
      rejectUnauthorized: false,
      requestCert: true,
    };

    const socket = tls.connect(options, async () => {
      const cert = socket.getPeerCertificate(true);
      socket.getProtocol(); // Used to verify TLS connection
      const cipher = socket.getCipher() as { name: string; version: string; bits?: number } | null;
      const authorized = socket.authorized;

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

      // Check for vulnerabilities
      if (!authorized) {
        vulnerabilities.push({
          name: 'Certificate Trust',
          severity: 'high',
          description: `Certificate not trusted: ${socket.authorizationError}`,
        });
      }

      if (daysUntilExpiry <= 0) {
        vulnerabilities.push({
          name: 'Expired Certificate',
          severity: 'critical',
          description: 'Certificate has expired',
        });
      } else if (daysUntilExpiry <= 7) {
        vulnerabilities.push({
          name: 'Expiring Certificate',
          severity: 'high',
          description: `Certificate expires in ${daysUntilExpiry} days`,
        });
      }

      // Check cipher strength
      if (cipher && cipher.name) {
        if (WEAK_CIPHERS.some(weak => cipher.name.includes(weak))) {
          vulnerabilities.push({
            name: 'Weak Cipher',
            severity: 'high',
            description: `Weak cipher in use: ${cipher.name}`,
          });
          recommendations.push('Configure server to use strong ciphers only');
        }
      }

      // Test all protocols
      const protocolResults = await Promise.all(
        PROTOCOLS_TO_TEST.map(p => testProtocol(hostname, port, p))
      );

      // Check protocol vulnerabilities
      const tls10Support = protocolResults.find(p => p.protocol === 'TLSv1');
      const tls11Support = protocolResults.find(p => p.protocol === 'TLSv1.1');
      const tls12Support = protocolResults.find(p => p.protocol === 'TLSv1.2');
      const tls13Support = protocolResults.find(p => p.protocol === 'TLSv1.3');

      if (tls10Support?.supported) {
        vulnerabilities.push({
          name: 'TLSv1.0 Enabled',
          severity: 'medium',
          description: 'TLSv1.0 is deprecated and vulnerable to BEAST and POODLE attacks',
        });
        recommendations.push('Disable TLSv1.0 support');
      }

      if (tls11Support?.supported) {
        vulnerabilities.push({
          name: 'TLSv1.1 Enabled',
          severity: 'low',
          description: 'TLSv1.1 is deprecated',
        });
        recommendations.push('Disable TLSv1.1 support');
      }

      if (!tls12Support?.supported && !tls13Support?.supported) {
        vulnerabilities.push({
          name: 'No Modern TLS',
          severity: 'critical',
          description: 'Server does not support TLSv1.2 or TLSv1.3',
        });
        recommendations.push('Enable TLSv1.2 and TLSv1.3 support');
      }

      if (!tls13Support?.supported) {
        recommendations.push('Enable TLSv1.3 for improved security and performance');
      }

      // Generate recommendations
      if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
        recommendations.push(`Renew certificate within ${daysUntilExpiry} days`);
      }

      const cipherInfo: CipherInfo = {
        name: cipher?.name || 'Unknown',
        version: cipher?.version || 'Unknown',
        bits: cipher?.bits || 0,
      };

      const grade = calculateGrade(protocolResults, cipherInfo, daysUntilExpiry, vulnerabilities);

      resolve({
        hostname,
        port,
        grade,
        certificate: {
          subject: cert.subject?.CN || 'Unknown',
          issuer: cert.issuer?.CN || 'Unknown',
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          daysUntilExpiry,
          serialNumber: cert.serialNumber,
          fingerprint: cert.fingerprint256 || cert.fingerprint || 'Unknown',
          signatureAlgorithm: cert.asn1Curve || 'Unknown',
          alternativeNames,
        },
        protocols: protocolResults,
        cipher: cipherInfo,
        vulnerabilities,
        recommendations,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('error', (error) => {
      reject(new Error(`Connection failed: ${error.message}`));
    });

    socket.setTimeout(15000, () => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

/**
 * security_ssl_analyze tool
 */
export const sslAnalyzeTool = defineTool<SSLAnalyzeInput, SSLAnalyzeOutput>({
  name: 'security_ssl_analyze',
  description: 'Comprehensive SSL/TLS security analysis. Checks certificate validity, protocol support, cipher strength, and known vulnerabilities. Returns a security grade (A+ to F).',
  category: 'security' as ToolCategory,
  inputSchema: SSLAnalyzeInputSchema,
  cacheTTL: 3600, // 1 hour
  cacheKeyFn: (input) => `${input.hostname}:${input.port}`,

  async handler(input) {
    let hostname = input.hostname;
    if (hostname.includes('://')) {
      hostname = extractDomain(hostname);
    }

    if (hostname.includes(':')) {
      hostname = hostname.split(':')[0];
    }

    if (!isValidDomain(hostname)) {
      throw MCPError.validationError(`Invalid hostname: ${hostname}`);
    }

    try {
      return await analyzeSSL(hostname, input.port);
    } catch (error) {
      throw MCPError.externalServiceError(
        hostname,
        error instanceof Error ? error.message : 'SSL analysis failed'
      );
    }
  },
});
