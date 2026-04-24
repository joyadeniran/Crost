/**
 * Data optimization utilities to minimize Supabase egress and payload overhead.
 */

/**
 * Truncates a string to a safe limit, appending an ellipsis if needed.
 */
export function truncateString(str: string | null | undefined, limit: number = 1000): string {
  if (!str) return '';
  if (str.length <= limit) return str;
  return str.slice(0, limit) + '... [TRUNCATED FOR EGRESS EFFICIENCY]';
}

/**
 * Strips potentially large and redundant blobs from an object's metadata.
 * Useful for filtering tool results before logging to event_log.
 */
export function cleanLargePayload(payload: any, maxChars: number = 500): any {
  if (!payload || typeof payload !== 'object') return payload;

  const cleaned = { ...payload };
  
  // Potential large keys to truncate
  const heavyKeys = ['raw', 'content', 'body', 'result', 'data', 'html', 'error'];
  
  for (const key of heavyKeys) {
    if (typeof cleaned[key] === 'string' && cleaned[key].length > maxChars) {
      cleaned[key] = truncateString(cleaned[key], maxChars);
    } else if (typeof cleaned[key] === 'object' && cleaned[key] !== null) {
      // If it's a nested object, just stringify and truncate if huge
      const str = JSON.stringify(cleaned[key]);
      if (str.length > maxChars) {
        cleaned[key] = {
          _type: 'truncated_blob',
          _original_size: str.length,
          preview: truncateString(str, maxChars)
        };
      }
    }
  }

  return cleaned;
}

// Map legacy icon-name strings → emoji for departments created before the wizard change
export const ICON_MAP: Record<string, string> = {
  'briefcase':   '💼',
  'code':        '💻',
  'code-2':      '💻',
  'megaphone':   '📣',
  'handshake':   '🤝',
  'bar-chart-2': '📊',
  'chart':       '📊',
  'settings-2':  '⚙️',
  'ops':         '⚙️',
  'shield':      '🛡️',
  'flask':       '🧪',
  'globe':       '🌐',
  'users':       '👥',
  'zap':         '⚡',
  'dollar-sign': '💰',
}

/**
 * Resolves a stored icon string (slug or emoji) to a displayable emoji.
 */
export function resolveIcon(icon: string | null | undefined): string {
  if (!icon) return '🏢';
  // If the input is in our map, return the mapped emoji
  if (ICON_MAP[icon]) return ICON_MAP[icon];
  // If not, return the icon as is (assuming it's already an emoji)
  return icon;
}

/**
 * Forcefully ensures a memo body doesn't exceed the storage threshold.
 */
export function formatMemoBody(body: string): string {
  // Mission Reports get a larger body limit so the synthesis isn't truncated
  const limit = body.includes('[Mission Report]') ? 3000 : 1000;
  return truncateString(body, limit);
}
