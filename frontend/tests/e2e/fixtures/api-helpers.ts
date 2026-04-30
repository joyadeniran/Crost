/**
 * API helper utilities for Playwright tests.
 * These hit the Next.js API routes directly via fetch (not the browser),
 * letting tests seed/tear-down state without UI interaction.
 */
import type { APIRequestContext } from '@playwright/test'

export async function getAuthHeaders(
  request: APIRequestContext,
  baseURL: string
): Promise<Record<string, string>> {
  // Playwright's storageState carries cookies; this helper wraps the session
  // cookie into a header-style object for direct API calls.
  return { Cookie: '' } // cookies are injected automatically by Playwright's context
}

/** Poll until goal.status matches one of the expected statuses, or timeout */
export async function pollGoalStatus(
  request: APIRequestContext,
  goalId: string,
  expectedStatuses: string[],
  { intervalMs = 1000, timeoutMs = 30_000 }: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<{ id: string; status: string; [key: string]: unknown }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const resp = await request.get(`/api/goals?limit=1`)
    if (resp.ok()) {
      const body = await resp.json()
      const goal = (body.data as Array<{ id: string; status: string }>).find(
        (g) => g.id === goalId
      )
      if (goal && expectedStatuses.includes(goal.status)) return goal
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(
    `Goal ${goalId} did not reach status ${expectedStatuses.join('|')} within ${timeoutMs}ms`
  )
}

/** Poll approval_queue until at least one pending approval exists */
export async function pollForPendingApproval(
  request: APIRequestContext,
  { intervalMs = 1000, timeoutMs = 30_000 }: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<Array<{ id: string; action_label: string; risk_level: string }>> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const resp = await request.get('/api/approvals?status=pending')
    if (resp.ok()) {
      const body = await resp.json()
      if ((body.data as unknown[]).length > 0) return body.data
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`No pending approvals appeared within ${timeoutMs}ms`)
}

/** Create a goal via the API and return its id */
export async function createGoal(
  request: APIRequestContext,
  founderInput: string
): Promise<string> {
  const resp = await request.post('/api/goals', {
    data: { founder_input: founderInput },
  })
  if (!resp.ok()) {
    const text = await resp.text()
    throw new Error(`POST /api/goals failed ${resp.status()}: ${text}`)
  }
  const body = await resp.json()
  return body.data.id as string
}

/** Approve a specific approval_queue entry */
export async function approveAction(request: APIRequestContext, approvalId: string) {
  const resp = await request.patch(`/api/approvals/${approvalId}`, {
    data: { decision: 'approved', decided_by: 'e2e-test' },
  })
  if (!resp.ok()) throw new Error(`PATCH /api/approvals/${approvalId} failed ${resp.status()}`)
  return resp.json()
}

/** Reject a specific approval_queue entry */
export async function rejectAction(request: APIRequestContext, approvalId: string) {
  const resp = await request.patch(`/api/approvals/${approvalId}`, {
    data: { decision: 'rejected', decided_by: 'e2e-test' },
  })
  if (!resp.ok()) throw new Error(`PATCH /api/approvals/${approvalId} failed ${resp.status()}`)
  return resp.json()
}
