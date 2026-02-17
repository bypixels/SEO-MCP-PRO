/**
 * Comprehensive security audit tools
 */

import { z } from 'zod';
import { defineTool, fetchUrl, fetchHtml, validateUrlInput } from '../base.js';
import { ToolCategory } from '../../types/tools.js';
import { extractDomain } from '../../utils/validators.js';
import { sslAnalyzeTool } from './ssl.js';
import { headersCheckTool } from './headers.js';

/** Security audit input schema */
const SecurityAuditInputSchema = z.object({
  url: z.string().describe('URL to audit'),
  deep: z.boolean().optional().default(false).describe('Enable deep scanning (slower)'),
});

type SecurityAuditInput = z.infer<typeof SecurityAuditInputSchema>;

interface SecurityFinding {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  recommendation?: string;
}

interface SecurityAuditOutput {
  url: string;
  domain: string;
  overallGrade: string;
  overallScore: number;
  findings: SecurityFinding[];
  summary: {
    ssl: {
      grade: string;
      issues: number;
    };
    headers: {
      grade: string;
      missing: number;
    };
    content: {
      issues: number;
    };
    total: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
    };
  };
  recommendations: string[];
  timestamp: string;
}

// Common sensitive paths to check
const SENSITIVE_PATHS = [
  '/.git/config',
  '/.env',
  '/.htaccess',
  '/wp-config.php',
  '/config.php',
  '/phpinfo.php',
  '/.DS_Store',
  '/web.config',
  '/server-status',
  '/elmah.axd',
];

/**
 * Check for exposed sensitive files
 */
async function checkSensitivePaths(
  baseUrl: string
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  const url = new URL(baseUrl);

  for (const path of SENSITIVE_PATHS) {
    try {
      const testUrl = `${url.protocol}//${url.host}${path}`;
      const result = await fetchUrl(testUrl, { timeout: 5000 });

      if (result.status === 200 && result.data.length > 0) {
        // Additional validation to reduce false positives
        const isLikelyReal =
          !result.data.includes('404') &&
          !result.data.includes('not found') &&
          !result.data.includes('error') &&
          result.data.length > 50;

        if (isLikelyReal) {
          findings.push({
            category: 'Sensitive File Exposure',
            severity: 'critical',
            title: `Sensitive file exposed: ${path}`,
            description: `The file ${path} is publicly accessible and may contain sensitive information.`,
            recommendation: `Restrict access to ${path} or remove it from the web server.`,
          });
        }
      }
    } catch {
      // Path not accessible, which is good
    }
  }

  return findings;
}

/**
 * Check page content for security issues
 */
async function checkContentSecurity(
  url: string
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  try {
    const { $ } = await fetchHtml(url);

    // Check for inline scripts without nonce/hash
    const inlineScripts = $('script:not([src]):not([nonce])');
    if (inlineScripts.length > 0) {
      findings.push({
        category: 'Content Security',
        severity: 'medium',
        title: 'Inline scripts without nonce',
        description: `Found ${inlineScripts.length} inline script(s) without nonce attributes.`,
        recommendation: 'Add nonce or hash to inline scripts for CSP compatibility.',
      });
    }

    // Check for mixed content potential
    const httpLinks = $('script[src^="http:"], link[href^="http:"], img[src^="http:"]');
    if (httpLinks.length > 0) {
      findings.push({
        category: 'Mixed Content',
        severity: 'medium',
        title: 'Potential mixed content',
        description: `Found ${httpLinks.length} resource(s) loaded over HTTP.`,
        recommendation: 'Ensure all resources are loaded over HTTPS.',
      });
    }

    // Check for forms without CSRF protection
    const forms = $('form');
    let formsWithoutToken = 0;
    forms.each((_, form) => {
      const hasToken = $(form).find('input[name*="csrf"], input[name*="token"], input[name*="_token"]').length > 0;
      if (!hasToken) {
        formsWithoutToken++;
      }
    });
    if (formsWithoutToken > 0) {
      findings.push({
        category: 'CSRF Protection',
        severity: 'medium',
        title: 'Forms potentially missing CSRF tokens',
        description: `Found ${formsWithoutToken} form(s) without apparent CSRF protection.`,
        recommendation: 'Implement CSRF tokens for all forms.',
      });
    }

    // Check for password fields without autocomplete="off"
    const passwordFields = $('input[type="password"]:not([autocomplete="off"]):not([autocomplete="new-password"]):not([autocomplete="current-password"])');
    if (passwordFields.length > 0) {
      findings.push({
        category: 'Form Security',
        severity: 'low',
        title: 'Password fields without autocomplete control',
        description: `Found ${passwordFields.length} password field(s) without explicit autocomplete attribute.`,
        recommendation: 'Set appropriate autocomplete attribute on password fields.',
      });
    }

    // Check for clickjacking-vulnerable iframes
    const iframes = $('iframe:not([sandbox])');
    if (iframes.length > 0) {
      findings.push({
        category: 'Content Security',
        severity: 'low',
        title: 'Iframes without sandbox attribute',
        description: `Found ${iframes.length} iframe(s) without sandbox restrictions.`,
        recommendation: 'Add sandbox attribute to iframes where possible.',
      });
    }

    // Check for external links without rel="noopener"
    const externalLinks = $('a[target="_blank"]:not([rel*="noopener"])');
    if (externalLinks.length > 0) {
      findings.push({
        category: 'Link Security',
        severity: 'low',
        title: 'External links vulnerable to tabnabbing',
        description: `Found ${externalLinks.length} external link(s) without rel="noopener".`,
        recommendation: 'Add rel="noopener noreferrer" to external links.',
      });
    }

    // Check for exposed email addresses
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const bodyText = $('body').text();
    const emails = bodyText.match(emailPattern);
    if (emails && emails.length > 0) {
      findings.push({
        category: 'Information Disclosure',
        severity: 'info',
        title: 'Email addresses exposed',
        description: `Found ${emails.length} email address(es) in page content.`,
        recommendation: 'Consider obfuscating email addresses to prevent scraping.',
      });
    }

    // Check for comments that might contain sensitive info
    const htmlContent = $.html();
    const commentPattern = /<!--[\s\S]*?-->/g;
    const comments = htmlContent.match(commentPattern) || [];
    const sensitiveComments = comments.filter(c =>
      c.includes('TODO') ||
      c.includes('FIXME') ||
      c.includes('password') ||
      c.includes('api') ||
      c.includes('key') ||
      c.includes('secret')
    );
    if (sensitiveComments.length > 0) {
      findings.push({
        category: 'Information Disclosure',
        severity: 'low',
        title: 'Potentially sensitive HTML comments',
        description: `Found ${sensitiveComments.length} HTML comment(s) that may contain sensitive information.`,
        recommendation: 'Review and remove sensitive comments before production.',
      });
    }

  } catch {
    // Content check failed, not critical
  }

  return findings;
}

/**
 * Calculate overall grade
 */
function calculateOverallGrade(
  sslGrade: string,
  headersGrade: string,
  findings: SecurityFinding[]
): { grade: string; score: number } {
  // Convert grades to scores
  const gradeToScore = (g: string): number => {
    const grades: Record<string, number> = {
      'A+': 100, 'A': 95, 'A-': 90,
      'B+': 85, 'B': 80, 'B-': 75,
      'C+': 70, 'C': 65, 'C-': 60,
      'D': 50, 'F': 30,
    };
    return grades[g] || 50;
  };

  let score = (gradeToScore(sslGrade) + gradeToScore(headersGrade)) / 2;

  // Deduct for findings
  for (const finding of findings) {
    switch (finding.severity) {
      case 'critical': score -= 15; break;
      case 'high': score -= 10; break;
      case 'medium': score -= 5; break;
      case 'low': score -= 2; break;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Convert score to grade
  if (score >= 95) return { grade: 'A+', score };
  if (score >= 90) return { grade: 'A', score };
  if (score >= 85) return { grade: 'A-', score };
  if (score >= 80) return { grade: 'B+', score };
  if (score >= 75) return { grade: 'B', score };
  if (score >= 70) return { grade: 'B-', score };
  if (score >= 65) return { grade: 'C+', score };
  if (score >= 60) return { grade: 'C', score };
  if (score >= 55) return { grade: 'C-', score };
  if (score >= 50) return { grade: 'D', score };
  return { grade: 'F', score };
}

/**
 * security_audit tool
 */
export const securityAuditTool = defineTool<SecurityAuditInput, SecurityAuditOutput>({
  name: 'security_audit',
  description: 'Comprehensive security audit combining SSL analysis, security headers check, sensitive file exposure, and content security analysis. Returns an overall security grade with detailed findings.',
  category: 'security' as ToolCategory,
  inputSchema: SecurityAuditInputSchema,

  async handler(input) {
    const url = validateUrlInput(input.url);
    const parsedUrl = new URL(url);
    const domain = extractDomain(url);
    const findings: SecurityFinding[] = [];
    const recommendations: string[] = [];

    // Run SSL analysis
    let sslGrade = 'F';
    let sslIssues = 0;
    if (parsedUrl.protocol === 'https:') {
      try {
        const sslResult = await sslAnalyzeTool.handler({ hostname: domain, port: 443 });
        sslGrade = sslResult.grade;
        sslIssues = sslResult.vulnerabilities.length;

        // Add SSL findings
        for (const vuln of sslResult.vulnerabilities) {
          findings.push({
            category: 'SSL/TLS',
            severity: vuln.severity,
            title: vuln.name,
            description: vuln.description,
          });
        }
        recommendations.push(...sslResult.recommendations);
      } catch {
        findings.push({
          category: 'SSL/TLS',
          severity: 'high',
          title: 'SSL Analysis Failed',
          description: 'Could not complete SSL analysis',
        });
      }
    } else {
      findings.push({
        category: 'SSL/TLS',
        severity: 'critical',
        title: 'No HTTPS',
        description: 'Site is not using HTTPS',
        recommendation: 'Enable HTTPS for all traffic',
      });
    }

    // Run headers check
    let headersGrade = 'F';
    let missingHeaders = 0;
    try {
      const headersResult = await headersCheckTool.handler({ url });
      headersGrade = headersResult.grade;
      missingHeaders = headersResult.missingHeaders.length;

      // Add headers findings
      for (const header of headersResult.headers) {
        if (header.grade === 'bad' || header.grade === 'missing') {
          findings.push({
            category: 'Security Headers',
            severity: header.grade === 'bad' ? 'high' : 'medium',
            title: `${header.name}: ${header.grade === 'bad' ? 'Misconfigured' : 'Missing'}`,
            description: header.description,
            recommendation: header.recommendation,
          });
        }
      }
      recommendations.push(...headersResult.recommendations);
    } catch {
      findings.push({
        category: 'Security Headers',
        severity: 'medium',
        title: 'Headers Analysis Failed',
        description: 'Could not complete security headers analysis',
      });
    }

    // Check content security
    const contentFindings = await checkContentSecurity(url);
    findings.push(...contentFindings);

    // Deep scan: check sensitive paths
    if (input.deep) {
      const sensitiveFindings = await checkSensitivePaths(url);
      findings.push(...sensitiveFindings);
    }

    // Count findings by severity
    const severityCounts = {
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
      info: findings.filter(f => f.severity === 'info').length,
    };

    // Calculate overall grade
    const { grade: overallGrade, score: overallScore } = calculateOverallGrade(
      sslGrade,
      headersGrade,
      findings
    );

    // Add recommendations for findings
    for (const finding of findings) {
      if (finding.recommendation && !recommendations.includes(finding.recommendation)) {
        recommendations.push(finding.recommendation);
      }
    }

    return {
      url,
      domain,
      overallGrade,
      overallScore,
      findings,
      summary: {
        ssl: {
          grade: sslGrade,
          issues: sslIssues,
        },
        headers: {
          grade: headersGrade,
          missing: missingHeaders,
        },
        content: {
          issues: contentFindings.length,
        },
        total: severityCounts,
      },
      recommendations: [...new Set(recommendations)], // Dedupe
      timestamp: new Date().toISOString(),
    };
  },
});
