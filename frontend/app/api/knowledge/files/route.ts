import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient();
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServerSupabaseClient();

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || '';
    const category = searchParams.get('category') || '';
    const limit = parseInt(searchParams.get('limit') || '10');

    let dbQuery = supabase
      .from('knowledge_base_files')
      .select('id, title, description, file_name, file_type, mime_type, category, tags, extracted_summary, processing_status, reference_count, created_at')
      .eq('created_by', user.id)
      .eq('processing_status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (category) {
      dbQuery = dbQuery.eq('category', category);
    }

    if (query) {
      dbQuery = dbQuery.or(`title.ilike.%${query}%,extracted_summary.ilike.%${query}%,file_name.ilike.%${query}%`);
    }

    const { data: files, error } = await dbQuery;
    if (error) throw error;

    return NextResponse.json({ files: files || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient();
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServerSupabaseClient();

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('id');
    if (!fileId) return NextResponse.json({ error: 'File ID required' }, { status: 400 });

    // Get the storage path first
    const { data: file } = await supabase
      .from('knowledge_base_files')
      .select('storage_path, created_by')
      .eq('id', fileId)
      .eq('created_by', user.id)
      .single();

    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    // Delete from storage
    if (file.storage_path) {
      await supabase.storage.from('knowledge-base').remove([file.storage_path]);
    }

    // Delete metadata (chunks cascade automatically)
    await supabase.from('knowledge_base_files').delete().eq('id', fileId).eq('created_by', user.id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
