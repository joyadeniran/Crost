// /api/artifacts/[id]
//
// GET    — fetch single artifact
// PATCH  — update artifact (title, status transitions, version bump). Blocked if status=active.
// DELETE — discard artifact. Blocked if status=active/paused/deprecated (use PATCH to deprecate).

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const IMMUTABLE_STATUSES = ['active', 'paused', 'deprecated'] as const

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

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

const PatchSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(['draft', 'review', 'active', 'paused', 'deprecated', 'discarded']).optional(),
  approved_by: z.string().uuid().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

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

    // Bump version when editing during review phase
    const versionBump = artifact.status === 'review' && isFieldEdit ? { version: artifact.version + 1 } : {}

    const { data: updated, error: updateErr } = await supabase
      .from('artifacts')
      .update({ ...parsed, ...versionBump })
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

    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

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
