// GET /api/artifacts — list artifacts (filter by type, department, goal)
// POST /api/artifacts — create a new artifact with file_url reference
//
// Per CROST_SPEC Section 6:
// - Artifacts store files in Supabase Storage (S3)
// - Database stores metadata only (file_url, not body)
// - Types: document, code, data, spreadsheet, image

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { beginIdempotentRequest, completeIdempotentRequest } from '@/lib/idempotency'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const department = searchParams.get('department')
    const goal = searchParams.get('goal')

    let query = supabase
      .from('artifacts')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    if (type) query = query.eq('artifact_type', type)
    if (department) query = query.eq('department_slug', department)
    if (goal) query = query.eq('goal_id', goal)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error('[GET /api/artifacts]', err)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch artifacts',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

const ArtifactSourcesSchema = z.object({
  memo_ids: z.array(z.string().uuid()).default([]),
  kb_file_ids: z.array(z.string().uuid()).default([]),
  tool_calls: z.array(z.record(z.unknown())).default([]),
})

// Schema for artifact creation — files should be uploaded to Supabase Storage separately
// This endpoint only stores metadata
const CreateArtifactSchema = z.object({
  goal_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  department_slug: z.string().min(1),
  // Spec §9: 'presentation' and 'pdf' are first-class MVP artefact types.
  artifact_type: z.enum(['image', 'document', 'code', 'data', 'spreadsheet', 'presentation', 'pdf']),
  title: z.string().min(1),
  file_url: z.string().url('file_url must be a valid URL pointing to Supabase Storage'),
  metadata: z.record(z.unknown()).default({}),
  preview_url: z.string().url().nullable().optional(),
  // Spec §9.5: skill slugs loaded during artefact production.
  skills_used: z.array(z.string()).default([]),
  // Spec §9: citations — non-negotiable on every artefact.
  sources: ArtifactSourcesSchema.default({ memo_ids: [], kb_file_ids: [], tool_calls: [] }),
  // Gallery v1: file size in bytes (populated from uploaded blob)
  file_size: z.number().int().min(0).nullable().optional(),
  // Gallery v1: task_id for lineage tracking
  task_id: z.string().uuid().nullable().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const body = await req.json()
    const parsed = CreateArtifactSchema.parse(body)
    const supabase = createServerSupabaseClient()

    const idempotency = await beginIdempotentRequest(req, supabase, user.id, body)
    if (idempotency.kind === 'response') return idempotency.response

    // Verify file_url is a valid HTTP(S) URL pointing to known storage
    let urlValid = false
    try {
      const url = new URL(parsed.file_url)
      urlValid = ['http:', 'https:'].includes(url.protocol) &&
        (url.hostname.includes('supabase') || url.hostname.includes('s3') || url.hostname.includes('amazonaws'))
    } catch {
      urlValid = false
    }
    if (!urlValid) {
      return NextResponse.json({
        success: false,
        error: 'file_url must be a valid URL pointing to Supabase Storage or S3. Did you upload the file first?',
        code: 'INVALID_FILE_URL'
      }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('artifacts')
      .insert({ ...parsed, created_by: user.id })
      .select()
      .single()

    if (error) throw error

    // Log artifact creation
    await supabase.from('event_log').insert({
      department_id: parsed.department_id,
      department_slug: parsed.department_slug,
      goal_id: parsed.goal_id,
      event_type: 'artifact_created',
      description: `Artifact created: "${parsed.title}"`,
      metadata: {
        artifact_id: data.id,
        artifact_type: parsed.artifact_type,
        file_url: parsed.file_url
      },
      created_by: user.id,
    })

    const responseBody = {
      success: true,
      data,
      timestamp: new Date().toISOString()
    }
    await completeIdempotentRequest(req, supabase, user.id, responseBody, 201)

    return NextResponse.json(responseBody, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        details: err.errors,
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    console.error('[POST /api/artifacts]', err)
    return NextResponse.json({
      success: false,
      error: 'Failed to create artifact',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
