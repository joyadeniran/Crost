// GET /api/artifacts/[id]/download
//
// Streams an artifact's file from the (private) GCS bucket through the service
// account, after verifying the requester owns the artifact. The bucket is not
// public, so the stored storage.googleapis.com URL cannot be fetched directly.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { gcsStorage } from '@/lib/gcs'

export const dynamic = 'force-dynamic'

const CONTENT_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  json: 'application/json',
  md: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()
    const { data: artifact, error } = await supabase
      .from('artifacts')
      .select('id, file_url, title, created_by')
      .eq('id', params.id)
      .eq('created_by', user.id)
      .single()

    if (error || !artifact) return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })

    const fileUrl: string | null = (artifact as { file_url?: string }).file_url ?? null
    if (!fileUrl) return NextResponse.json({ error: 'Artifact has no downloadable file' }, { status: 404 })

    // Derive the object path relative to the 'artifacts' logical bucket.
    // Handles legacy double-prefixed URLs (.../artifacts/artifacts/...) too —
    // gcsStorage.getObject() collapses any redundant leading 'artifacts/'.
    const marker = '/artifacts/'
    const idx = fileUrl.indexOf(marker)
    if (idx === -1) return NextResponse.json({ error: 'Unrecognized artifact URL' }, { status: 422 })
    const objectPath = fileUrl.slice(idx + marker.length)

    const { data: bytes, error: dlErr } = await gcsStorage.from('artifacts').getObject(objectPath)
    if (dlErr || !bytes) {
      console.error('[artifact download] GCS read failed:', dlErr?.message, 'path:', objectPath)
      return NextResponse.json({ error: 'File not found in storage' }, { status: 404 })
    }

    const fileName = (objectPath.split('/').pop()?.split('?')[0]) || `${artifact.id}`
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/artifacts/[id]/download]', err)
    return NextResponse.json({ error: 'Failed to download artifact' }, { status: 500 })
  }
}
