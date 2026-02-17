/**
 * Output formatting utilities
 */

/**
 * Format number with thousands separator
 */
export function formatNumber(num: number, decimals = 0): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format currency
 */
export function formatCurrency(
  amount: number,
  currency = 'USD',
  locale = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Format Google Ads micros to currency
 * Google Ads uses micros (1 million = $1)
 */
export function formatMicros(micros: number, currency = 'USD'): string {
  return formatCurrency(micros / 1_000_000, currency);
}

/**
 * Format date for display
 */
export function formatDateDisplay(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format datetime for display
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  }

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  }

  if (diffDays < 30) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }

  return formatDateDisplay(d);
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Convert snake_case to camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase to snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Format Core Web Vitals metrics
 */
export function formatCWVMetric(
  metric: 'lcp' | 'fid' | 'cls' | 'inp' | 'ttfb',
  value: number
): string {
  switch (metric) {
    case 'lcp':
    case 'fid':
    case 'inp':
    case 'ttfb':
      return formatDuration(value);
    case 'cls':
      return value.toFixed(3);
    default:
      return String(value);
  }
}

/**
 * Get CWV rating based on value
 */
export function getCWVRating(
  metric: 'lcp' | 'fid' | 'cls' | 'inp' | 'ttfb',
  value: number
): 'good' | 'needs-improvement' | 'poor' {
  const thresholds = {
    lcp: { good: 2500, poor: 4000 },
    fid: { good: 100, poor: 300 },
    cls: { good: 0.1, poor: 0.25 },
    inp: { good: 200, poor: 500 },
    ttfb: { good: 800, poor: 1800 },
  };

  const t = thresholds[metric];
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

/**
 * Format SSL grade with description
 */
export function formatSSLGrade(grade: string): string {
  const descriptions: Record<string, string> = {
    'A+': 'Excellent',
    A: 'Good',
    'A-': 'Good',
    B: 'Fair',
    C: 'Needs Improvement',
    D: 'Poor',
    E: 'Very Poor',
    F: 'Critical',
    T: 'Trust Issues',
    M: 'Certificate Mismatch',
  };

  return descriptions[grade] || grade;
}

/**
 * Format security header grade
 */
export function formatSecurityGrade(
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
): { grade: string; color: string; description: string } {
  const grades = {
    'A+': { color: 'green', description: 'Excellent security configuration' },
    A: { color: 'green', description: 'Good security configuration' },
    B: { color: 'yellow', description: 'Fair, some improvements needed' },
    C: { color: 'orange', description: 'Moderate security issues' },
    D: { color: 'red', description: 'Significant security issues' },
    E: { color: 'red', description: 'Severe security issues' },
    F: { color: 'red', description: 'Critical security issues' },
  };

  return { grade, ...grades[grade] };
}

/**
 * Create a simple table from data
 */
export function formatTable(
  headers: string[],
  rows: (string | number)[][]
): string {
  const columnWidths = headers.map((header, i) => {
    const maxDataWidth = Math.max(
      ...rows.map(row => String(row[i]).length)
    );
    return Math.max(header.length, maxDataWidth);
  });

  const separator = columnWidths.map(w => '-'.repeat(w)).join(' | ');
  const headerRow = headers
    .map((h, i) => h.padEnd(columnWidths[i]))
    .join(' | ');

  const dataRows = rows.map(row =>
    row.map((cell, i) => String(cell).padEnd(columnWidths[i])).join(' | ')
  );

  return [headerRow, separator, ...dataRows].join('\n');
}
