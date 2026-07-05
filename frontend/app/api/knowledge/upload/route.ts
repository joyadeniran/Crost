import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase';
import { extractText } from '@/lib/knowledge/extract-text';
import { callLLM, getModel, callEmbeddings } from '@/lib/llm-client';
import { beginIdempotentRequest, completeIdempotentRequest } from '@/lib/idempotency';
import { resumeBlockedTasksAfterUpload } from '@/lib/knowledge/resume-tasks';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user using cookie-aware client
    const authClient = await createSupabaseServerComponentClient();
    const { data: { user }, error: authErr } = await authClient.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Use service role client for DB/Storage operations (bypasses RLS for async processing)
    const supabase = createServerSupabaseClient();

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = (formData.get('title') as string) || '';
    const category = (formData.get('category') as string) || 'custom';
    const description = (formData.get('description') as string) || '';
    // Optional: goal whose needs_data tasks should auto-resume once this
    // file finishes processing (mid-task upload flow). Ownership-verified below.
    const goalIdRaw = (formData.get('goal_id') as string) || '';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate type and size
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'File exceeds 25MB limit' }, { status: 413 });
    }

    const idempotencyBody = {
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      title,
      category,
      description,
    };
    const idempotency = await beginIdempotentRequest(req, supabase, user.id, idempotencyBody);
    if (idempotency.kind === 'response') return idempotency.response;

    // Per-user rate limit: max 10 uploads per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from('knowledge_base_files')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', user.id)
      .gte('created_at', oneHourAgo);

    if ((recentCount ?? 0) >= 10) {
      return NextResponse.json({ error: 'Rate limit: maximum 10 uploads per hour' }, { status: 429 });
    }

    // 1. Insert pending metadata row
    const { data: fileRow, error: insertErr } = await supabase
      .from('knowledge_base_files')
      .insert({
        created_by: user.id,
        title: title || file.name,
        description,
        file_name: file.name,
        file_type: file.name.split('.').pop()?.toLowerCase() || '',
        mime_type: file.type,
        file_size: file.size,
        category,
        storage_path: '', // placeholder
        file_url: '',     // placeholder
        upload_status: 'uploading',
        processing_status: 'pending',
      })
      .select('id')
      .single();

    if (insertErr || !fileRow) {
      return NextResponse.json({ error: 'Failed to create file record' }, { status: 500 });
    }

    const fileId = fileRow.id;
    const storagePath = `${user.id}/${fileId}/${file.name}`;

    // 2. Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('knowledge-base')
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (uploadErr || !uploadData) {
      await supabase.from('knowledge_base_files').update({ upload_status: 'failed' }).eq('id', fileId);
      return NextResponse.json({ error: 'Storage upload failed', detail: uploadErr?.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from('knowledge-base').getPublicUrl(storagePath);
    const fileUrl = urlData.publicUrl;

    // Update row with real URL
    await supabase.from('knowledge_base_files').update({
      storage_path: storagePath,
      file_url: fileUrl,
      upload_status: 'uploaded',
      processing_status: 'processing',
    }).eq('id', fileId);

    // Ownership check for the auto-resume goal: cross-user goal ids are
    // silently ignored (never error the upload, never leak existence).
    let resumeGoalId: string | null = null;
    if (goalIdRaw) {
      const { data: ownedGoal } = await supabase
        .from('goals')
        .select('id')
        .eq('id', goalIdRaw)
        .eq('created_by', user.id)
        .single();
      if (ownedGoal) resumeGoalId = ownedGoal.id;
    }

    // 3. Extract text (async — do not block the response)
    processFileAsync(buffer, file.type, file.name, fileId, user.id, supabase, resumeGoalId);

    const responseBody = {
      success: true,
      fileId,
      file_url: fileUrl,
      processing_status: 'processing',
      message: 'File uploaded. Text extraction in progress.',
    };
    await completeIdempotentRequest(req, supabase, user.id, responseBody, 200);

    return NextResponse.json(responseBody);

  } catch (err: any) {
    console.error('[KB Upload]', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}

async function processFileAsync(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  fileId: string,
  userId: string,
  supabase: any,
  resumeGoalId: string | null = null
) {
  try {
    // Extract text
    const extracted = await extractText(buffer, mimeType, fileName, userId);

    // Generate summary + tags via LLM
    let extractedSummary = '';
    let tags: string[] = [];

    if (extracted.text.length > 50) {
      const { model } = await getModel('summarization', userId);
      const summaryPrompt = `You are a document analyst. Read the following document excerpt and produce:
1. A concise 2-4 sentence summary of what this document contains.
2. 3-6 relevant tags (lowercase, single words or short phrases).

Document:
---
${extracted.text.slice(0, 4000)}
---

Respond in JSON exactly: { "summary": "...", "tags": ["tag1", "tag2", ...] }`;

      const llmRes = await callLLM(model, summaryPrompt, 'You are a structured JSON extraction assistant.', userId);
      try {
        const stripped = llmRes.content.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
        const parsed = JSON.parse(stripped);
        extractedSummary = parsed.summary || '';
        tags = parsed.tags || [];
      } catch {
        extractedSummary = extracted.text.slice(0, 300);
      }
    }

    // Chunk text into ~800-char segments for future retrieval
    const chunks: { content: string; index: number; tokenCount: number }[] = [];
    const CHUNK_SIZE = 800;
    const words = extracted.text.split(/\s+/);
    let current = '';
    let chunkIndex = 0;
    for (const word of words) {
      if ((current + ' ' + word).length > CHUNK_SIZE && current.length > 0) {
        chunks.push({ content: current.trim(), index: chunkIndex++, tokenCount: Math.ceil(current.length / 4) });
        current = word;
      } else {
        current += ' ' + word;
      }
    }
    if (current.trim()) {
      chunks.push({ content: current.trim(), index: chunkIndex, tokenCount: Math.ceil(current.length / 4) });
    }

    // Save chunks with embeddings (Phase 3)
    if (chunks.length > 0) {
      try {
        const texts = chunks.map(c => c.content);
        const embeddings = await callEmbeddings(texts, userId);

        await supabase.from('knowledge_base_chunks').insert(
          chunks.map((c, i) => ({
            knowledge_file_id: fileId,
            created_by: userId,
            chunk_index: c.index,
            content: c.content,
            token_count: c.tokenCount,
            embedding: embeddings[i],
          }))
        );
      } catch (embedErr) {
        console.warn('[KB Embeddings] Failed to generate/store embeddings, saving chunks without them:', embedErr);
        // Fallback: save without embeddings
        await supabase.from('knowledge_base_chunks').insert(
          chunks.map(c => ({
            knowledge_file_id: fileId,
            created_by: userId,
            chunk_index: c.index,
            content: c.content,
            token_count: c.tokenCount,
          }))
        );
      }
    }

    // Mark completed
    await supabase.from('knowledge_base_files').update({
      extracted_text: extracted.text.slice(0, 50000), // store first 50k chars
      extracted_summary: extractedSummary,
      extracted_metadata: {
        method: extracted.method,
        confidence: extracted.confidence,
        pageCount: extracted.pageCount,
        chunkCount: chunks.length,
        warnings: extracted.warnings,
        hasEmbeddings: true,
      },
      tags,
      processing_status: 'completed',
      updated_at: new Date().toISOString(),
    }).eq('id', fileId);

    // Mid-task upload flow: unblock the goal's needs_data tasks now that the
    // new knowledge is searchable. Non-fatal by contract.
    if (resumeGoalId) {
      await resumeBlockedTasksAfterUpload(resumeGoalId, userId);
    }

  } catch (err) {
    console.error('[KB Process Async]', err);
    await supabase.from('knowledge_base_files').update({
      processing_status: 'failed',
      updated_at: new Date().toISOString(),
    }).eq('id', fileId);
  }
}
