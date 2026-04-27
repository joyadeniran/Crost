import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Internal tool: knowledge_base_read
 * Fetches the full extracted text content of a knowledge base file.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { userId, file_id } = await req.json();

    if (!userId || !file_id) {
      return NextResponse.json({ error: 'userId and file_id are required' }, { status: 400 });
    }

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
