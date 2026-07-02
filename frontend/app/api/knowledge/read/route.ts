import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic';

/**
 * Internal tool: knowledge_base_read
 * Fetches the full extracted text content of a knowledge base file.
 */
export async function POST(req: NextRequest) {
  try {
    const INTERNAL_SECRET = process.env.WORKER_INTERNAL_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    const internalSecret = req.headers.get('x-crost-internal-secret');
    const isInternalCall = internalSecret && INTERNAL_SECRET && internalSecret === INTERNAL_SECRET;

    let userId: string;
    let file_id: string;

    if (isInternalCall) {
      const body = await req.json();
      userId = body.userId;
      file_id = body.file_id;
    } else {
      const guardResult = await requireUser(req)
      if (!guardResult.ok) return guardResult.response
      const user = { id: guardResult.userId }
      userId = user.id;
      const body = await req.json();
      file_id = body.file_id;
    }

    if (!userId || !file_id) {
      return NextResponse.json({ error: 'file_id is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: file, error } = await supabase
      .from('knowledge_base_files')
      .select('id, title, extracted_text, extracted_summary, category')
      .eq('id', file_id)
      .eq('created_by', userId)
      .single();

    if (error || !file) {
      return NextResponse.json({ error: 'File not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true,
      file_id: file.id,
      title: file.title,
      content: file.extracted_text || 'No text content extracted for this file.',
      summary: file.extracted_summary,
      category: file.category
    });
  } catch (err: any) {
    console.error('[KB Read Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
