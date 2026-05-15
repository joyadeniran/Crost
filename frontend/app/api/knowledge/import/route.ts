import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase';
import { extractText } from '@/lib/knowledge/extract-text';
import { callLLM, getModel, callEmbeddings } from '@/lib/llm-client';
import { beginIdempotentRequest, completeIdempotentRequest } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

/**
 * POST /api/knowledge/import
 * Imports an existing artifact into the Knowledge Base.
 * 
 * Body: { artifact_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { artifact_id } = body;
    if (!artifact_id) {
      return NextResponse.json({ error: 'artifact_id is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const idempotency = await beginIdempotentRequest(req, supabase, user.id, body);
    if (idempotency.kind === 'response') return idempotency.response;

    // 1. Fetch artifact details
    const { data: artifact, error: artErr } = await supabase
      .from('artifacts')
      .select('*')
      .eq('id', artifact_id)
      .eq('created_by', user.id)
      .single();

    if (artErr || !artifact) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    }

    // 2. Insert metadata row into knowledge_base_files
    const fileName = artifact.file_url.split('/').pop() || 'artifact.file';
    const { data: fileRow, error: insertErr } = await supabase
      .from('knowledge_base_files')
      .insert({
        created_by: user.id,
        title: artifact.title || fileName,
        description: `Imported from artifact: ${artifact.title}`,
        file_name: fileName,
        file_type: fileName.split('.').pop()?.toLowerCase() || '',
        mime_type: artifact.artifact_type === 'pdf' ? 'application/pdf' : 'application/octet-stream', // heuristic
        file_size: 0, // will update after copy
        category: 'research',
        storage_path: '', // placeholder
        file_url: '',     // placeholder
        upload_status: 'uploading',
        processing_status: 'pending',
        metadata: { source_artifact_id: artifact_id }
      })
      .select('id')
      .single();

    if (insertErr || !fileRow) {
      throw new Error(`Failed to create KB file record: ${insertErr.message}`);
    }

    const fileId = fileRow.id;
    const destPath = `${user.id}/${fileId}/${fileName}`;

    // 3. Clone file in storage
    // Artifact URL usually looks like: https://.../storage/v1/object/public/artifacts/goals/UUID/filename
    // We need the relative path inside the 'artifacts' bucket.
    const urlParts = artifact.file_url.split('/artifacts/');
    if (urlParts.length < 2) {
      throw new Error('Could not resolve artifact storage path');
    }
    const sourcePath = urlParts[1];

    const { error: copyErr } = await supabase.storage
      .from('artifacts')
      .copy(sourcePath, destPath, { destinationBucket: 'knowledge-base' });

    if (copyErr) {
      await supabase.from('knowledge_base_files').update({ upload_status: 'failed' }).eq('id', fileId);
      throw new Error(`Storage copy failed: ${copyErr.message}`);
    }

    const { data: urlData } = supabase.storage.from('knowledge-base').getPublicUrl(destPath);
    const fileUrl = urlData.publicUrl;

    // Update row with real URL
    await supabase.from('knowledge_base_files').update({
      storage_path: destPath,
      file_url: fileUrl,
      upload_status: 'uploaded',
      processing_status: 'processing',
    }).eq('id', fileId);

    // 4. Trigger processing
    // We need to download it briefly to extract text if it's not local.
    // Since we're in the same environment, we can just grab it.
    const { data: fileBlob } = await supabase.storage.from('knowledge-base').download(destPath);
    if (fileBlob) {
      const buffer = Buffer.from(await fileBlob.arrayBuffer());
      processFileAsync(buffer, artifact.artifact_type || 'application/octet-stream', fileName, fileId, user.id, supabase);
    }

    const responseBody = {
      success: true,
      fileId,
      message: 'Artifact imported to Knowledge Base. Extraction in progress.'
    };
    await completeIdempotentRequest(req, supabase, user.id, responseBody, 200);

    return NextResponse.json(responseBody);

  } catch (err: any) {
    console.error('[KB Import]', err);
    return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 });
  }
}

// Re-using the logic from upload/route.ts (ideally these would be in a shared lib)
async function processFileAsync(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  fileId: string,
  userId: string,
  supabase: any
) {
  try {
    // Extract text
    const { extractText } = await import('@/lib/knowledge/extract-text');
    const extracted = await extractText(buffer, mimeType, fileName, userId);

    // Generate summary + tags via LLM
    let extractedSummary = '';
    let tags: string[] = [];

    if (extracted.text.length > 50) {
      const summaryPrompt = `You are a document analyst. Read the following document excerpt and produce:
1. A concise 2-4 sentence summary of what this document contains.
2. 3-6 relevant tags (lowercase, single words or short phrases).

Document:
---
${extracted.text.slice(0, 4000)}
---

Respond in JSON exactly: { "summary": "...", "tags": ["tag1", "tag2", ...] }`;

      const llmRes = await callLLM('groq/llama-3.3-70b-versatile', summaryPrompt, 'You are a structured JSON extraction assistant.', userId);
      try {
        const stripped = llmRes.content.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
        const parsed = JSON.parse(stripped);
        extractedSummary = parsed.summary || '';
        tags = parsed.tags || [];
      } catch {
        extractedSummary = extracted.text.slice(0, 300);
      }
    }

    // Chunking logic (simplified)
    const chunks: string[] = [];
    const CHUNK_SIZE = 800;
    for (let i = 0; i < extracted.text.length; i += CHUNK_SIZE) {
      chunks.push(extracted.text.slice(i, i + CHUNK_SIZE));
    }

    // Save chunks (without embeddings for MVP speed, or use existing callEmbeddings)
    if (chunks.length > 0) {
        try {
            const embeddings = await callEmbeddings(chunks, userId);
            await supabase.from('knowledge_base_chunks').insert(
                chunks.map((content, index) => ({
                    knowledge_file_id: fileId,
                    created_by: userId,
                    chunk_index: index,
                    content,
                    token_count: Math.ceil(content.length / 4),
                    embedding: embeddings[index]
                }))
            );
        } catch (e) {
            await supabase.from('knowledge_base_chunks').insert(
                chunks.map((content, index) => ({
                    knowledge_file_id: fileId,
                    created_by: userId,
                    chunk_index: index,
                    content,
                    token_count: Math.ceil(content.length / 4)
                }))
            );
        }
    }

    // Mark completed
    await supabase.from('knowledge_base_files').update({
      extracted_text: extracted.text.slice(0, 50000),
      extracted_summary: extractedSummary,
      tags,
      processing_status: 'completed',
      updated_at: new Date().toISOString(),
    }).eq('id', fileId);

  } catch (err) {
    console.error('[KB Import Process Async]', err);
    await supabase.from('knowledge_base_files').update({
      processing_status: 'failed',
    }).eq('id', fileId);
  }
}
