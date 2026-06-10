// lib/tools/providers/composio.ts
// GCP migration: Composio replaced by Google ADK + direct Google APIs.
// This module retains the same function signature for backward compatibility
// with call sites that haven't been fully migrated to ADK yet.

export interface ToolResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
  /** Human-readable summary of the result */
  summary?: string
  /** Service that was called (e.g. 'gmail', 'github') */
  service?: string
  /** Action that was executed (e.g. 'send_email') */
  action?: string
  /** Raw API response for debugging */
  rawResponse?: unknown
}

// Legacy slug override map — kept for approval route compatibility
export const COMPOSIO_SLUG_OVERRIDE_MAP: Record<string, string> = {
  GMAIL_CREATE_DRAFT: 'GMAIL_CREATE_EMAIL_DRAFT',
}

/**
 * Execute a named tool action via Google APIs / ADK.
 * External Google service actions (Gmail, Calendar, etc.) require
 * the user's Google OAuth token from Firebase.
 */
export async function runComposioTool({
  toolName,
  service,
  action: actionParam,
  params,
  userId,
}: {
  /** Legacy: full action name (e.g. 'GMAIL_SEND_EMAIL') */
  toolName?: string
  /** Service slug (e.g. 'gmail') */
  service?: string
  /** Action slug (e.g. 'send_email') */
  action?: string
  params: Record<string, unknown>
  userId: string
}): Promise<ToolResult> {
  const resolvedService = service ?? (toolName ? toolName.split('_')[0] : 'unknown')
  const resolvedAction = actionParam ?? toolName ?? 'unknown'
  const actionUpper = resolvedAction.toUpperCase()
  console.log(`[GCP tools] Executing ${actionUpper} for user ${userId}`)

  // All external tool executions now go through the ADK approval flow.
  // This stub returns a pending status — actual execution happens post-approval
  // via the approvals route which calls Google APIs directly.
  return {
    success: false,
    service: resolvedService,
    action: resolvedAction,
    summary: `Action ${actionUpper} requires founder approval.`,
    error: `Action ${actionUpper} requires founder approval. Use the ADK requestApproval tool to queue this action.`,
    data: { action: actionUpper, params, requires_approval: true },
  }
}
