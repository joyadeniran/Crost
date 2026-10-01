// lib/background.ts
// Serverless-safe background work for Vercel.
//
// A function instance can be frozen as soon as the response is sent, which
// silently kills un-awaited promises (the old Cloud Run worker never had this
// problem). Anything that must outlive the response goes through
// runInBackground(), which registers it with the platform via waitUntil.
// Server-side ONLY.

import { waitUntil } from '@vercel/functions'

export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export function getInternalSecret(): string {
  return process.env.WORKER_INTERNAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

/** Keep `work` alive after the response is returned. Never throws. */
export function runInBackground(work: Promise<unknown>): void {
  const safe = work.catch((err) => console.error('[background] task failed:', err))
  try {
    waitUntil(safe)
  } catch {
    // Not running on Vercel (tests / local dev): the promise just runs on.
  }
}

/**
 * Fire an internal dispatch for one task, or CHAIN_REACTION for a whole goal.
 * Authenticated with the internal-secret header (dual-mode auth).
 */
export function triggerDispatch(goalId: string, taskId: string): void {
  runInBackground(
    fetch(`${getBaseUrl()}/api/goals/${goalId}/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-crost-internal-secret': getInternalSecret(),
      },
      body: JSON.stringify({ task_id: taskId }),
    })
  )
}
