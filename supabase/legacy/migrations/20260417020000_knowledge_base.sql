-- Migration v9.1: Knowledge Base
-- Adds knowledge_base_files and knowledge_base_chunks tables.
-- Aligns with the Crost architectural rule:
--   KB = raw founder context | Memo = distilled active state | Artefacts = outputs

CREATE TABLE IF NOT EXISTS knowledge_base_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- File Metadata
  title TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  file_type TEXT,
  mime_type TEXT,
  file_size INTEGER,
  storage_path TEXT NOT NULL,
  file_url TEXT NOT NULL,

  -- Classification
  source_type TEXT DEFAULT 'upload'
    CHECK (source_type IN ('upload', 'generated', 'imported')),
  category TEXT DEFAULT 'custom'
    CHECK (category IN (
      'company_profile', 'pitch_deck', 'financial_report', 'handbook',
      'meeting_notes', 'research', 'legal', 'marketing', 'sales',
      'product', 'operations', 'custom'
    )),
  tags TEXT[] DEFAULT '{}',

  -- Processing Pipeline State
  upload_status TEXT DEFAULT 'uploaded'
    CHECK (upload_status IN ('uploading', 'uploaded', 'failed')),
  processing_status TEXT DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),

  -- Extracted Intelligence
  extracted_text TEXT,
  extracted_summary TEXT,
  extracted_metadata JSONB DEFAULT '{}'::jsonb,

  -- Embedding Readiness (Phase 3+)
  embedding_status TEXT DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'completed', 'failed')),

  -- Usage Tracking
  reference_count INTEGER DEFAULT 0,
  last_referenced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chunks table — pre-wired for pgvector in Phase 3
CREATE TABLE IF NOT EXISTS knowledge_base_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_file_id UUID REFERENCES knowledge_base_files(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  -- embedding vector(1536), -- Phase 3: uncomment when pgvector enabled
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE knowledge_base_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_chunks ENABLE ROW LEVEL SECURITY;

-- Files policies
CREATE POLICY "kb_files_select" ON knowledge_base_files FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "kb_files_insert" ON knowledge_base_files FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "kb_files_update" ON knowledge_base_files FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "kb_files_delete" ON knowledge_base_files FOR DELETE USING (auth.uid() = created_by);

-- Chunks policies
CREATE POLICY "kb_chunks_select" ON knowledge_base_chunks FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "kb_chunks_insert" ON knowledge_base_chunks FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "kb_chunks_delete" ON knowledge_base_chunks FOR DELETE USING (auth.uid() = created_by);

-- Note: knowledge_base_search is an internal tool intercepted directly by the
-- executeToolCall gateway. It does NOT need a row in available_tools, which
-- now has a composite PK (id, user_id) and is scoped per-user for external tools only.
