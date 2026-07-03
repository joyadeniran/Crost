// /api/artifacts/[id]
//
// GET    — fetch single artifact
// PATCH  — update artifact (title, status transitions, version bump). Blocked if status=active.
// DELETE — discard artifact. Blocked if status=active/paused/deprecated (use PATCH to deprecate).

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const IMMUTABLE_STATUSES = ['active', 'paused', 'deprecated'] as const

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const supabase = createServerSupabaseClient()
    const { data: artifact, error } = await supabase
      .from('artifacts')
      .select('*')
      .eq('id', params.id)
      .eq('created_by', user.id)
      .single()

    if (error || !artifact) return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })

    return NextResponse.json({ success: true, data: artifact, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[GET /api/artifacts/[id]]', err)
    return NextResponse.json({ success: false, error: 'Failed to fetch artifact', timestamp: new Date().toISOString() }, { status: 500 })
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

// Phase 5 fix (spec §9.4): approved_by removed from client-accepted input.
// Evidence: cloudsql_migration.sql:445-446 defines artifacts.approved_by as
// TEXT (Firebase UID, same convention as created_by), but this schema
// validated it as a UUID — a format real Firebase UIDs fail, and no
// frontend caller ever sent it (grep-confirmed) — so it was always null.
// Root cause: approved_by was designed as client input instead of a
// server-derived value at the moment of approval, unlike published_at,
// which the DB trigger (enforce_artifact_status_transition) already stamps
// server-side on the same review->active transition. Now derived below from
// the authenticated session, the same way — never trust-worthy as client
// input since the artifact owner could otherwise attribute approval to an
// arbitrary UID.
const PatchSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(['draft', 'review', 'active', 'paused', 'deprecated', 'discarded']).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const body = await req.json()
    const parsed = PatchSchema.parse(body)
    const supabase = createServerSupabaseClient()

    const { data: artifact, error: fetchErr } = await supabase
      .from('artifacts')
      .select('id, status, version, created_by, title, department_slug')
      .eq('id', params.id)
      .eq('created_by', user.id)
      .single()

    if (fetchErr || !artifact) return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })

    // Immutability: active/paused/deprecated artifacts cannot be field-edited.
    // Status transitions (e.g. active → deprecated) are allowed via status field only.
    const isFieldEdit = parsed.title !== undefined
    if (isFieldEdit && IMMUTABLE_STATUSES.includes(artifact.status as typeof IMMUTABLE_STATUSES[number])) {
      return NextResponse.json({
        success: false,
        error: `Artifact is ${artifact.status} and immutable. Use "Make changes" to create a new version.`,
        code: 'ARTIFACT_IMMUTABLE',
        timestamp: new Date().toISOString(),
      }, { status: 409 })
    }

    // Validate status transition rules (DB trigger also enforces these, but fail fast here)
    if (parsed.status) {
      if (['active', 'paused', 'deprecated'].includes(artifact.status) && parsed.status === 'discarded') {
        return NextResponse.json({
          success: false,
          error: 'Cannot discard a published artifact. Use deprecated to archive it.',
          code: 'INVALID_STATUS_TRANSITION',
          timestamp: new Date().toISOString(),
        }, { status: 422 })
      }
      if (['draft', 'review'].includes(artifact.status) && parsed.status === 'deprecated') {
        return NextResponse.json({
          success: false,
          error: 'Cannot deprecate an unpublished artifact. Use discarded instead.',
          code: 'INVALID_STATUS_TRANSITION',
          timestamp: new Date().toISOString(),
        }, { status: 422 })
      }
    }

    // Bump version on field edits during draft or review (spec §9.4 line
    // 655: "draft: ... Version increments on each edit"; line 656 says the
    // same for review). Previously only checked for 'review' — draft edits
    // never bumped version.
    const versionBump = ['draft', 'review'].includes(artifact.status) && isFieldEdit ? { version: artifact.version + 1 } : {}

    // Phase 5 fix (spec §9.4): approved_by is server-derived from the
    // authenticated session at the moment of transition INTO active, never
    // accepted from the client (see PatchSchema comment above).
    const approvalStamp = artifact.status !== 'active' && parsed.status === 'active' ? { approved_by: user.id } : {}

    const { data: updated, error: updateErr } = await supabase
      .from('artifacts')
      .update({ ...parsed, ...versionBump, ...approvalStamp })
      .eq('id', params.id)
      .select()
      .single()

    if (updateErr) throw updateErr

    // Log status transitions
    if (parsed.status && parsed.status !== artifact.status) {
      const eventMap: Record<string, string> = {
        active: 'artifact_activated',
        discarded: 'artifact_discarded',
        deprecated: 'artifact_deprecated',
      }
      const eventType = eventMap[parsed.status]
      if (eventType) {
        void Promise.resolve(supabase.from('event_log').insert({
          department_slug: artifact.department_slug,
          event_type: eventType,
          description: `Artifact "${artifact.title}" moved to ${parsed.status}`,
          metadata: { artifact_id: params.id, from_status: artifact.status, to_status: parsed.status },
          created_by: user.id,
        })).catch(() => {})
      }
    }

    return NextResponse.json({ success: true, data: updated, timestamp: new Date().toISOString() })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Validation failed', details: err.errors, timestamp: new Date().toISOString() }, { status: 400 })
    }
    // Catch immutability trigger violation from DB
    const msg = String(err)
    if (msg.includes('immutable') || msg.includes('status_transition')) {
      return NextResponse.json({ success: false, error: msg.split('\n')[0], code: 'ARTIFACT_IMMUTABLE', timestamp: new Date().toISOString() }, { status: 409 })
    }
    console.error('[PATCH /api/artifacts/[id]]', err)
    return NextResponse.json({ success: false, error: 'Failed to update artifact', timestamp: new Date().toISOString() }, { status: 500 })
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    if (!id) return NextResponse.json({ error: 'Artifact ID is required' }, { status: 400 })

    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const supabase = createServerSupabaseClient()

    const { data: artifact, error: fetchErr } = await supabase
      .from('artifacts')
      .select('id, file_url, created_by, title, department_slug, status')
      .eq('id', id)
      .single()

    if (fetchErr || !artifact) return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
    if (artifact.created_by !== user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    // Active artifacts cannot be hard-deleted — use PATCH status=deprecated to archive
    if (IMMUTABLE_STATUSES.includes(artifact.status as typeof IMMUTABLE_STATUSES[number])) {
      return NextResponse.json({
        success: false,
        error: `Cannot delete a ${artifact.status} artifact. Use PATCH status=deprecated to archive it instead.`,
        code: 'ARTIFACT_IMMUTABLE',
        timestamp: new Date().toISOString(),
      }, { status: 409 })
    }

    // Delete file from storage
    if (artifact.file_url) {
      try {
        const urlParts = artifact.file_url.split('/artifacts/')
        if (urlParts.length > 1) {
          await supabase.storage.from('artifacts').remove([urlParts[1]])
        }
      } catch (storageErr) {
        console.warn('[Artifact Storage Delete Warning]', storageErr)
      }
    }

    const { error: deleteErr } = await supabase
      .from('artifacts')
      .delete()
      .eq('id', id)
      .eq('created_by', user.id)

    if (deleteErr) throw deleteErr

    ;(async () => {
      try {
        await supabase.from('event_log').insert({
          department_slug: artifact.department_slug,
          event_type: 'artifact_discarded',
          description: `Artifact discarded: "${artifact.title}"`,
          metadata: { artifact_id: id },
          created_by: user.id,
        })
      } catch { /* best-effort */ }
    })()

    return NextResponse.json({ success: true, message: 'Artifact discarded', timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[DELETE /api/artifacts/[id]]', err)
    return NextResponse.json({ success: false, error: 'Failed to discard artifact', timestamp: new Date().toISOString() }, { status: 500 })
  }
}
