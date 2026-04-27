import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { callEmbeddings } from '@/lib/llm-client';

export const dynamic = 'force-dynamic';

// Internal tool: knowledge_base_search
// Called by execute-tool-call.ts when service='internal' action='knowledge_base_search'
// Also callable from Orc/departments via the standard tool exec pathway.

/**
 * Writes matched KB file IDs back to the calling artifact's sources column.
 * Spec §10 / DoD #14: "All retrievals populate the calling artefact's sources.kb_file_ids"
 */
async function writeKbSourcesToArtifact(
  supabase: any,
  artifactId: string | undefined,
  kbFileIds: string[]
) {
  if (!artifactId || kbFileIds.length === 0) return;
  try {
    // Fetch existing sources to merge (avoid overwriting memo_ids or tool_calls)
    const { data: artifact } = await supabase
      .from('artifacts')
      .select('sources')
      .eq('id', artifactId)
      .single();

    const existingSources = artifact?.sources ?? {};
    const existingKbIds: string[] = existingSources.kb_file_ids ?? [];
    const mergedKbIds = [...new Set([...existingKbIds, ...kbFileIds])];

    await supabase
      .from('artifacts')
      .update({
        sources: {
          ...existingSources,
          kb_file_ids: mergedKbIds,
        },
      })
      .eq('id', artifactId);
  } catch (err) {
    console.warn('[KB Search] Failed to write sources back to artifact:', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { userId, query, category, fileType, limit = 5, artifact_id } = await req.json();

    if (!userId || !query) {
      return NextResponse.json({ error: 'userId and query are required' }, { status: 400 });
    }

    // Search files by title, summary, and tags
    let dbQuery = supabase
      .from('knowledge_base_files')
      .select('id, title, category, tags, extracted_summary, file_type, reference_count, created_at')
      .eq('created_by', userId)
      .eq('processing_status', 'completed')
      .order('reference_count', { ascending: false })
      .limit(limit);

    if (category) dbQuery = dbQuery.eq('category', category);
    if (fileType) dbQuery = dbQuery.eq('file_type', fileType);

    // Search by title or summary match
    dbQuery = dbQuery.or(
      `title.ilike.%${query}%,extracted_summary.ilike.%${query}%`
    );

    const { data: files, error } = await dbQuery;
    if (error) throw error;

    if (!files || files.length === 0) {
      // Phase 3: Try semantic search first
      try {
        const queryEmbeddings = await callEmbeddings(query, userId);
        const { data: vectorMatches, error: matchErr } = await supabase.rpc('match_kb_chunks', {
          query_embedding: queryEmbeddings[0],
          match_threshold: 0.5,
          match_count: limit,
          p_user_id: userId
        });

        if (vectorMatches && vectorMatches.length > 0) {
          // Hydrate with parent file info
          const fileIds = [...new Set(vectorMatches.map((c: any) => c.knowledge_file_id as string))] as string[];
          const { data: parentFiles } = await supabase
            .from('knowledge_base_files')
            .select('id, title, category, extracted_summary')
            .in('id', fileIds);

          const fileMap = new Map((parentFiles ?? []).map(f => [f.id, f]));

          const matches = vectorMatches.map((chunk: any) => {
            const parent = fileMap.get(chunk.knowledge_file_id);
            return {
              title: parent?.title || 'Unknown',
              summary: parent?.extracted_summary || '',
              chunk: chunk.content,
              category: parent?.category || '',
              relevance: Math.round(chunk.similarity * 100) / 100,
            };
          });

          // Increment reference_count for matched files (async, best-effort)
          fileIds.forEach(async (id) => {
            try { await supabase.rpc('increment_kb_reference', { file_id: id }); } catch { /* best-effort */ }
          });

          await writeKbSourcesToArtifact(supabase, artifact_id, fileIds);
          return NextResponse.json({ matches });
        }
      } catch (embedErr) {
        console.warn('[KB Search] Semantic search failed, falling back to keywords:', embedErr);
      }

      // Keyword Fallback (Existing logic)
      const { data: chunks } = await supabase
        .from('knowledge_base_chunks')
        .select('content, knowledge_file_id, chunk_index')
        .eq('created_by', userId)
        .ilike('content', `%${query}%`)
        .limit(limit);

      if (!chunks || chunks.length === 0) {
        // Discovery Fallback: If no matches found, check if the query is a "listing" request
        const discoveryKeywords = ['what', 'list', 'show', 'all', 'available', 'documents', 'files', 'here', 'have'];
        const isDiscovery = discoveryKeywords.some(k => query.toLowerCase().includes(k));
        
        if (isDiscovery) {
          const { data: latestFiles } = await supabase
            .from('knowledge_base_files')
            .select('title, category, extracted_summary')
            .eq('created_by', userId)
            .eq('processing_status', 'completed')
            .order('created_at', { ascending: false })
            .limit(limit);
          
          if (latestFiles && latestFiles.length > 0) {
            return NextResponse.json({ 
              matches: latestFiles.map(f => ({
                title: f.title,
                summary: f.extracted_summary || 'Available document',
                chunk: '[Discovery Result] Listed from Knowledge Base.',
                category: f.category,
                relevance: 0.5
              }))
            });
          }
        }
        return NextResponse.json({ matches: [] });
      }

      // Hydrate with parent file info
      const fileIds = [...new Set(chunks.map((c: any) => c.knowledge_file_id as string))];
      const { data: parentFiles } = await supabase
        .from('knowledge_base_files')
        .select('id, title, category, extracted_summary')
        .in('id', fileIds);

      const fileMap = new Map((parentFiles ?? []).map(f => [f.id, f]));

      const matches = chunks.map(chunk => {
        const parent = fileMap.get(chunk.knowledge_file_id);
        return {
          title: parent?.title || 'Unknown',
          summary: parent?.extracted_summary || '',
          chunk: chunk.content,
          category: parent?.category || '',
          relevance: 0.6, // placeholder until embeddings
        };
      });

      // Increment reference_count for matched files
      if (fileIds.length > 0) {
        for (const id of fileIds) {
          try {
            await supabase.rpc('increment_kb_reference', { file_id: id });
          } catch { /* best-effort */ }
        }
      }

      await writeKbSourcesToArtifact(supabase, artifact_id, fileIds);
      return NextResponse.json({ matches });
    }

    // Format results for Orc injection — summaries only (no full text to avoid token bloat)
    const matches = files.map(f => ({
      title: f.title,
      summary: f.extracted_summary || 'No summary available.',
      chunk: null, // No chunk at this level of search
      category: f.category,
      tags: f.tags,
      relevance: 0.8, // placeholder until embeddings
    }));

    // Increment reference_count
    const fileIds = files.map(f => f.id);
    for (const id of fileIds) {
      try {
        await supabase
          .from('knowledge_base_files')
          .update({ reference_count: (supabase as any).rpc('increment_kb_reference', { file_id: id }), last_referenced_at: new Date().toISOString() })
          .eq('id', id);
      } catch { /* best-effort */ }
    }

    await writeKbSourcesToArtifact(supabase, artifact_id, fileIds);
    return NextResponse.json({ matches });
  } catch (err: any) {
    console.error('[KB Search]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
