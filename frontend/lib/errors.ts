/**
 * Crost Premium Error Registry
 * 
 * Central source of truth for all founder-facing error codes.
 * Format: CR-[CATEGORY]-[SOURCE]-[CODE]
 */

export interface CrostError {
  code: string;
  founderMessage: string;
  actionLabel?: string;
  actionHref?: string;
}

export const ERROR_REGISTRY: Record<string, CrostError> = {
  // AUTH
  'CR-AUTH-401': {
    code: 'CR-AUTH-401',
    founderMessage: 'Your session has expired.',
    actionLabel: 'SIGN IN AGAIN',
    actionHref: '/login'
  },
  
  // LLM / INTELLIGENCE
  'CR-LLM-QUOTA': {
    code: 'CR-LLM-QUOTA',
    founderMessage: 'Daily free limit reached.',
    actionLabel: 'ADD API KEY',
    actionHref: '/dashboard/settings?tab=keys'
  },
  'CR-LLM-GATEWAY': {
    code: 'CR-LLM-GATEWAY',
    founderMessage: 'The intelligence provider is temporarily unavailable. We are attempting to recover...',
    actionLabel: 'RETRY MISSION',
  },
  'CR-LLM-AUTH': {
    code: 'CR-LLM-AUTH',
    founderMessage: 'Authentication issue with the intelligence provider. Please check your API keys.',
    actionLabel: 'FIX KEYS',
    actionHref: '/dashboard/settings?tab=keys'
  },
  'CR-LLM-RATE': {
    code: 'CR-LLM-RATE',
    founderMessage: 'Intelligence rate limit reached. Throttling requests...',
    actionLabel: 'WAIT'
  },

  // TOOLS / COMPOSIO
  'CR-TOOL-GMAIL': {
    code: 'CR-TOOL-GMAIL',
    founderMessage: 'Unable to access your Gmail account.',
    actionLabel: 'RECONNECT GMAIL',
    actionHref: '/dashboard/settings?tab=integrations'
  },
  'CR-TOOL-GITHUB': {
    code: 'CR-TOOL-GITHUB',
    founderMessage: 'GitHub authentication failed.',
    actionLabel: 'FIX CONNECTION',
    actionHref: '/dashboard/settings?tab=integrations'
  },
  'CR-TOOL-TRACKING': {
    code: 'CR-TOOL-TRACKING',
    founderMessage: 'Failed to record tool execution metrics.',
    actionLabel: 'REPORT ISSUE',
  },

  // DATABASE / MEMO
  'CR-DB-MEMO': {
    code: 'CR-DB-MEMO',
    founderMessage: 'Failed to save strategic data to your Memo.',
    actionLabel: 'RETRY SAVE',
  },
  'CR-DB-SYNC': {
    code: 'CR-DB-SYNC',
    founderMessage: 'Database synchronization interrupted.',
    actionLabel: 'SYNC NOW',
    actionHref: '/dashboard'
  }
};

/**
 * Returns a humanized error object from a technical error message or code.
 */
export function resolveCrostError(technicalMessage: string): CrostError {
  // 1. Check if it's already a code
  if (ERROR_REGISTRY[technicalMessage]) return ERROR_REGISTRY[technicalMessage];

  // 2. Heuristic matching
  if (technicalMessage.includes('SYSTEM_LIMIT_EXCEEDED')) return ERROR_REGISTRY['CR-LLM-QUOTA'];
  
  if (technicalMessage.includes('LiteLLM error')) {
    if (technicalMessage.includes('503')) return ERROR_REGISTRY['CR-LLM-GATEWAY'];
    if (technicalMessage.includes('429')) return ERROR_REGISTRY['CR-LLM-RATE'];
    if (technicalMessage.includes('401') || technicalMessage.includes('400')) return ERROR_REGISTRY['CR-LLM-AUTH'];
    return ERROR_REGISTRY['CR-LLM-GATEWAY'];
  }

  if (technicalMessage.includes('gmail')) return ERROR_REGISTRY['CR-TOOL-GMAIL'];
  if (technicalMessage.includes('github')) return ERROR_REGISTRY['CR-TOOL-GITHUB'];
  if (technicalMessage.includes('track tool execution')) return ERROR_REGISTRY['CR-TOOL-TRACKING'];
  if (technicalMessage.includes('schema cache') || technicalMessage.includes('404')) return ERROR_REGISTRY['CR-DB-SYNC'];

  // 3. Fallback
  return {
    code: 'CR-SYS-GENERIC',
    founderMessage: technicalMessage || 'An unexpected interruption occurred.',
    actionLabel: 'RETRY'
  };
}
