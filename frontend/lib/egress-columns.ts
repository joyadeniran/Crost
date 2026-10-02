// lib/egress-columns.ts — explicit column lists for LIST queries so rows never drag full bodies over
// the pooler. Detail routes (GET /api/artifacts/[id], download) still return the full row.

/** Artifact grid/list: body truncated to what the card preview needs (see extractPreviewText). */
export const ARTIFACT_LIST_COLUMNS =
  'id, goal_id, department_id, department_slug, artifact_type, title, left(body, 1500) AS body, metadata, preview_url, status, version, published_at, approved_by, sources, skills_used, file_size, file_url, task_id, suggested_actions, created_by, created_at'

/** Default page size for list endpoints. */
export const DEFAULT_LIST_LIMIT = 50
export const MAX_LIST_LIMIT = 200

export function parseLimit(raw: string | null, fallback = DEFAULT_LIST_LIMIT): number {
  const n = parseInt(raw ?? '', 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, MAX_LIST_LIMIT)
}
