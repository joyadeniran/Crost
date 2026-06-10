// lib/tools/providers/composio.ts
// GCP migration: Composio replaced by Google ADK + direct Google APIs.
// This module retains the same function signature for backward compatibility
// with call sites that haven't been fully migrated to ADK yet.

export interface ToolResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
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
  params,
  userId,
}: {
  toolName: string
  params: Record<string, unknown>
  userId: string
}): Promise<ToolResult> {
  const action = toolName.toUpperCase()
  console.log(`[GCP tools] Executing ${action} for user ${userId}`)

  // All external tool executions now go through the ADK approval flow.
  // This stub returns a pending status — actual execution happens post-approval
  // via the approvals route which calls Google APIs directly.
  return {
    success: false,
    error: `Action ${action} requires founder approval. Use the ADK requestApproval tool to queue this action.`,
    data: { action, params, requires_approval: true },
  }
}
