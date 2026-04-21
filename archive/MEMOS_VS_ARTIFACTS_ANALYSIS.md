# Memos vs Artifacts Separation Issue — Analysis & Fix Plan

## Problem Statement

**Current State**: Company memos and artifacts are conflated — both stored as JSON in the database, making them unreadable to humans and violating CROST_SPEC.

**User Requirement**: 
- Memos should be human-readable structured data about company state
- Artifacts should be downloadable files (xlsx, docx, txt)
- All fixes must follow CROST_SPEC (Sections 5-6)

---

## CROST_SPEC Requirements

### Section 5: Company Memo (CRITICAL)
**Definition**: The Memo is the single source of truth for company state.

**Storage**: PostgreSQL (Supabase) — structured + append-only logs

**Required Structure**:
```
CompanyMemo = {
  company_profile: {
    name,
    industry,
    location,
    description
  },
  active_goals: [],
  strategies: [],
  task_logs: [],
  artefact_references: [],
  decisions: [],
  department_notes: {}
}
```

**Rules**:
- Every task MUST read from Memo
- Every task MUST write to Memo
- Orc re-reads Memo before every decision

### Section 6: Artifacts System
**Storage Strategy**: Files stored in Supabase Storage (or S3), DB stores metadata only

**Artifact Table Structure**:
```
Artefact = {
  id,
  type: "doc" | "excel" | "image",
  file_url,
  task_id,
  created_by,
  created_at,
  metadata
}
```

**Rules**:
- Long outputs → Artefact
- Downloadable content → Artefact
- Memo stores only references
- MVP Supported Types: Documents, Excel/CSV, Images

---

## Current Code Issues

### Issue 1: Department Task Endpoint (route.ts - Line 177-186)
**File**: `/app/api/departments/[slug]/task/route.ts`

**Problem**: Stores entire LLM response as memo JSON, regardless of size/type.

```typescript
// WRONG: All content stored as unstructured JSON memo
await supabase.from('company_memos').insert({
  from_department: dept.name,
  from_department_id: dept.id,
  title: `[Direct Chat] ${body.task.slice(0, 80)}`,
  body: answer,  // ← Entire LLM response as JSON
  tags: ['department_chat', dept.slug],
  source_type: 'agent',
  confidence: 0.7,
  created_by: user.id,
})
```

**Impact**: 
- Large responses (>1200 chars) should be artifacts, not memos
- Memos become JSON blobs, not structured company state
- No downloadable file support

---

### Issue 2: Worker Execute Endpoint (route.ts - Line 146-157)
**File**: `/app/api/worker/execute/route.ts`

**Problem**: Inconsistent handling of large outputs — sometimes creates artifacts, but stores reference as text in memo.

```typescript
// PARTIAL FIX: Creates artifact for large outputs (>1200 chars)
if (fullBodyText.length > 1200) {
  const { data: artifact } = await supabase.from('artifacts').insert({
    goal_id: task.goal_id,
    department_slug: task.dept_slug,
    artifact_type: 'document',
    title: `Tool Output: ${toolName}`,
    body: fullBodyText,  // ← Still storing body as text, not file
    // ...
  })
}

// Then stores reference in memo, but as text reference
await supabase.from('company_memos').insert({
  body: artifactReference
    ? `${bodyText}\n\nReadable artifact saved in Artifacts with ID: ${artifactReference}`
    : bodyText,  // ← Reference is just text, not structured
  // ...
})
```

**Impact**:
- Artifact.body is still stored as text, not file
- Memo stores reference as text string, not structured artefact_references array
- No actual downloadable file in Supabase Storage

---

### Issue 3: Artifact Endpoint Schema (route.ts - Line 50-59)
**File**: `/app/api/artifacts/route.ts`

**Problem**: Schema allows `body` field (text), but CROST_SPEC says artifacts should be files in Storage.

```typescript
const CreateArtifactSchema = z.object({
  // ...
  body: z.string().nullable().optional(),  // ← Text body, not file
  // ...
})
```

**Impact**:
- No support for actual file uploads to Supabase Storage
- Artifacts are JSON with text content, not downloadable files
- Can't generate downloadable xlsx, docx, etc.

---

### Issue 4: Memos Table Schema Violation
**File**: `company_memos` table

**Current Structure**:
```
- id
- title
- body (TEXT) — entire LLM response or JSON
- priority
- from_department
- from_department_id
- tags
- source_type
- confidence
- created_by
- created_at
- read_by
```

**Problem**: This is a simple memo store, not the structured Company Memo defined in CROST_SPEC.

**Missing Fields** (per CROST_SPEC Section 5):
- company_profile
- active_goals
- strategies
- task_logs
- artefact_references (should be array of artifact IDs)
- decisions
- department_notes

---

## Fix Implementation Plan

### Fix 1: Create Proper Company Memo Table
**File**: New migration in Supabase

```sql
-- Create structured company_memo (singular) table
CREATE TABLE IF NOT EXISTS company_memo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Company Profile
  company_profile JSONB DEFAULT '{"name": null, "industry": null, "location": null, "description": null}'::jsonb,
  
  -- Business State
  active_goals JSONB[] DEFAULT '{}',
  strategies JSONB[] DEFAULT '{}',
  task_logs JSONB[] DEFAULT '{}',
  artefact_references UUID[] DEFAULT '{}',
  decisions JSONB[] DEFAULT '{}',
  department_notes JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Note**: For MVP, keep existing `company_memos` table for chat/log history, but create new `company_memo` (singular) as single source of truth.

---

### Fix 2: Update Department Task Endpoint
**File**: `/app/api/departments/[slug]/task/route.ts`

**Changes**:
1. Check response size before storing
2. If response > 1200 chars AND is downloadable content (json, csv, etc) → store as artifact file
3. If response < 1200 chars OR is narrative text → store as memo
4. Update memo to reference artifacts properly

```typescript
// AFTER: Proper separation
const isLargeContent = answer.length > 1200;
const isStructuredData = answer.includes('{') && answer.includes('}'); // JSON-like

if (isLargeContent && isStructuredData) {
  // Store as artifact file
  const artifactId = await createArtifactFromContent(answer, dept.id, user.id);
  
  // Update memo with structured reference
  await updateCompanyMemo({
    artefact_references: [artifactId],
    department_notes: { [dept.slug]: summary }
  });
} else {
  // Store as regular memo
  await supabase.from('company_memos').insert({
    from_department: dept.name,
    from_department_id: dept.id,
    title: `Task: ${body.task.slice(0, 80)}`,
    body: answer,
    tags: ['department_task', dept.slug],
    source_type: 'agent',
    created_by: user.id,
  });
}
```

---

### Fix 3: Update Worker Execute Endpoint
**File**: `/app/api/worker/execute/route.ts`

**Changes**:
1. Store large outputs as actual files in Supabase Storage
2. Store metadata in artifacts table
3. Update memo with structured artefact_references

```typescript
// AFTER: Proper artifact storage
if (fullBodyText.length > 1200) {
  // Detect output type
  const isJson = tryParseJSON(fullBodyText);
  const isCsv = fullBodyText.includes(',') && fullBodyText.includes('\n');
  
  let fileType = isJson ? 'application/json' : isCsv ? 'text/csv' : 'text/plain';
  let extension = isJson ? '.json' : isCsv ? '.csv' : '.txt';
  
  // Upload to Supabase Storage
  const fileName = `task-${taskId}-${Date.now()}${extension}`;
  const { data: uploadData, error: uploadErr } = await supabase
    .storage
    .from('artifacts')
    .upload(`goals/${task.goal_id}/${fileName}`, fullBodyText, {
      contentType: fileType,
      upsert: false
    });
  
  if (!uploadErr && uploadData) {
    const fileUrl = supabase.storage
      .from('artifacts')
      .getPublicUrl(uploadData.path).data.publicUrl;
    
    // Store metadata in artifacts table
    const { data: artifact } = await supabase
      .from('artifacts')
      .insert({
        goal_id: task.goal_id,
        department_slug: task.dept_slug,
        artifact_type: isJson ? 'data' : isCsv ? 'spreadsheet' : 'document',
        title: `Tool Output: ${toolName}`,
        file_url: fileUrl,
        metadata: {
          toolName,
          taskId,
          source: 'tool_execution',
          fileType,
          sizeBytes: fullBodyText.length
        },
        created_by: userId
      })
      .select('id')
      .single();
    
    // Store memo with structured reference
    await updateCompanyMemo({
      artefact_references: [...existing, artifact?.id],
      task_logs: [{
        taskId,
        tool: toolName,
        status: 'completed',
        artifactId: artifact?.id,
        timestamp: new Date().toISOString()
      }]
    });
  }
}
```

---

### Fix 4: Update Artifacts Endpoint Schema
**File**: `/app/api/artifacts/route.ts`

**Changes**:
1. Remove `body` field (use file_url instead)
2. Add `file_url` requirement for non-preview artifacts
3. Add file type validation

```typescript
const CreateArtifactSchema = z.object({
  goal_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  department_slug: z.string().min(1),
  artifact_type: z.enum(['image', 'document', 'code', 'data', 'spreadsheet']),
  title: z.string().min(1),
  file_url: z.string().url(), // ← Required, points to Supabase Storage
  metadata: z.record(z.unknown()).default({}),
  preview_url: z.string().url().nullable().optional(),
})
```

---

## Migration Path

**Phase 1 (Immediate)**:
1. Create `company_memo` (singular) table
2. Update department task endpoint to check content size
3. Update worker execute to store files in Supabase Storage

**Phase 2 (Short-term)**:
1. Migrate existing large `company_memos` entries to artifacts
2. Update API to use new structured memo format
3. Update Orc to read/write to structured memo

**Phase 3 (User-facing)**:
1. Update UI to show downloadable artifacts
2. Update dashboard memo viewer to show structured company state
3. Add artifact download buttons

---

## Validation Checklist

After implementation:
- [ ] Department task outputs > 1200 chars are stored as files in Supabase Storage
- [ ] Artifact table has file_url pointing to actual downloadable file
- [ ] Memos contain structured references (artefact_references: UUID[])
- [ ] JSON exports from departments are stored as .json files
- [ ] CSV data from departments is stored as .csv files
- [ ] Users can download artifacts directly
- [ ] company_memo table has proper structure per CROST_SPEC
- [ ] Existing memos remain readable in chat history
- [ ] No JSON blobs in memo body field for large outputs
