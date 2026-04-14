// DELETE /api/artifacts/[id] — delete an artifact and its file from storage
// Per CROST_SPEC Section 6:
// - Delete artifact metadata from database
// - Delete file from Supabase Storage
// - Only the creator can delete

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    if (!id) {
      return NextResponse.json({ error: 'Artifact ID is required' }, { status: 400 })
    }

    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()

    // 1. Fetch artifact to verify ownership and get file_url
    const { data: artifact, error: fetchErr } = await supabase
      .from('artifacts')
      .select('id, file_url, created_by, title, department_slug')
      .eq('id', id)
      .single()

    if (fetchErr || !artifact) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
    }

    // 2. Verify ownership
    if (artifact.created_by !== user.id) {
      return NextResponse.json({ error: 'Unauthorized: You can only delete your own artifacts' }, { status: 403 })
    }

    // 3. Delete file from Supabase Storage if file_url exists
    if (artifact.file_url) {
      try {
        // Extract the path from the file_url
        // Format: https://xxxx.supabase.co/storage/v1/object/public/artifacts/goals/...
        const urlParts = artifact.file_url.split('/artifacts/')
        if (urlParts.length > 1) {
          const filePath = `artifacts/${urlParts[1]}`
          const { error: deleteErr } = await supabase.storage
            .from('artifacts')
            .remove([urlParts[1]])

          if (deleteErr) {
            console.warn('[Artifact Storage Delete Warning]', deleteErr)
            // Don't fail the whole operation if storage delete fails
          }
        }
      } catch (storageErr) {
        console.warn('[Artifact Storage Delete Error]', storageErr)
        // Continue to delete metadata even if storage delete fails
      }
    }

    // 4. Delete artifact metadata from database
    const { error: deleteErr } = await supabase
      .from('artifacts')
      .delete()
      .eq('id', id)
      .eq('created_by', user.id)

    if (deleteErr) throw deleteErr

    // 5. Log deletion (fire-and-forget, non-blocking)
    // We don't await this intentionally - logging failures should not block deletion
    ;(async () => {
      try {
        await supabase.from('event_log').insert({
          department_slug: artifact.department_slug,
          event_type: 'artifact_created',
          description: `Artifact deleted: "${artifact.title}"`,
          metadata: {
            artifact_id: id,
            action: 'delete'
          },
          created_by: user.id,
        })
      } catch (err) {
        console.warn('Failed to log artifact deletion:', err)
      }
    })()

    return NextResponse.json({
      success: true,
      message: 'Artifact deleted successfully',
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error('[DELETE /api/artifacts/[id]]', err)
    return NextResponse.json({
      success: false,
      error: 'Failed to delete artifact',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
