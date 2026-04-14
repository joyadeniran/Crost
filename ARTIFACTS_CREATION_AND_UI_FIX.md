# Artifacts Creation & UI Fix Plan

## Problem Summary

**Issue 1: No artifacts being created**
- Excel sheet task creates memo entry but NO artifact file
- Task outputs not stored in artifacts table
- No file downloads available

**Issue 2: No artifacts UI**
- Artifacts page doesn't exist or is empty
- No way to view, download, edit, or delete artifacts
- User can't manage their artifacts

**Root Causes Identified**

### Root Cause 1: Bug in Worker Execute Endpoint
**File**: `app/api/worker/execute/route.ts` Line 80

```typescript
// WRONG: Using original content instead of transformed fileContent
const { data: uploadData, error: uploadErr } = await supabase
  .storage
  .from('artifacts')
  .upload(`goals/${goalId}/${fileName}`, content, {  // ← BUG: Should be fileContent
    contentType: fileType,
    upsert: false,
  });
```

**Impact**: Even if transformers create proper Excel/Markdown/DOCX, the upload still sends JSON

### Root Cause 2: Transformer Functions Not Fully Implemented
**Files**: `lib/artifact-transformers/*.ts`

- Some transformers return Buffer but upload expects string
- DOCX transformer not properly generating .docx files
- No error handling if xlsx library not available

### Root Cause 3: Missing Artifacts Gallery UI
**Missing**:
- No artifacts page/component exists
- No file manager interface
- No download/delete/edit buttons
- No preview functionality

### Root Cause 4: Artifact Metadata Not Stored
**Issue**: Artifact table not being updated with proper metadata
- No title/description
- No task reference
- No proper artifact type classification

---

## Two-Part Fix

### Part A: Fix Artifact Creation Pipeline

#### Step A1: Fix Worker Execute Upload Bug

**File**: `app/api/worker/execute/route.ts`  
**Line**: 80

**Change**:
```typescript
// BEFORE (WRONG)
const { data: uploadData, error: uploadErr } = await supabase
  .storage
  .from('artifacts')
  .upload(`goals/${goalId}/${fileName}`, content, {  // ← BUG
    contentType: fileType,
    upsert: false,
  });

// AFTER (CORRECT)
const { data: uploadData, error: uploadErr } = await supabase
  .storage
  .from('artifacts')
  .upload(`goals/${goalId}/${fileName}`, fileContent, {  // ← FIXED
    contentType: fileType,
    upsert: false,
  });
```

**Time**: 5 minutes  
**Impact**: HIGH - Fixes the core issue of files not being uploaded

#### Step A2: Improve Transformer Functions

**File**: `lib/artifact-transformers/document-transformer.ts`

**Issue**: Current implementation doesn't use docx skill properly

```typescript
// CURRENT (Incomplete)
export async function transformToDocument(data: any): Promise<string | Buffer> {
  // Not properly generating .docx
}

// NEEDS TO USE DOCX SKILL
```

**Solution**: Create proper DOCX generation using docx library or skill

```typescript
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

export async function transformToDocument(data: any): Promise<Buffer> {
  const emailTemplate = data?.refined_email_template || data?.email_template || data;
  
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          text: "Email Template",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 }
        }),
        new Paragraph({
          text: `Subject: ${emailTemplate.subject || 'N/A'}`,
          spacing: { after: 100 },
          bold: true
        }),
        new Paragraph({
          text: emailTemplate.body || '',
          spacing: { after: 200 },
          alignment: 'left'
        })
      ]
    }]
  });
  
  return await Packer.toBuffer(doc);
}
```

**Time**: 15 minutes  
**Impact**: HIGH - Generates proper .docx files for email templates

#### Step A3: Enhance Artifact Metadata Storage

**File**: `app/api/worker/execute/route.ts`  
**Around Line**: 99-115

**Current**:
```typescript
const { data: artifact, error: artifactErr } = await supabase
  .from('artifacts')
  .insert({
    goal_id: goalId,
    department_slug: deptSlug,
    artifact_type: artifactType,
    title: `Tool Output: ${toolName}`,  // ← Too generic
    file_url: fileUrl,
    metadata: { ... }
  })
```

**Improved**:
```typescript
// Extract better title from task/tool context
const artifactTitle = getArtifactTitle(detection.contentType, parsed);

const { data: artifact, error: artifactErr } = await supabase
  .from('artifacts')
  .insert({
    goal_id: goalId,
    department_slug: deptSlug,
    artifact_type: artifactType,
    title: artifactTitle,  // ← Better title
    file_url: fileUrl,
    metadata: {
      toolName,
      taskId,
      source: 'tool_execution',
      contentType: detection.contentType,
      fileType: detection.targetFormat,
      sizeBytes: typeof fileContent === 'string' ? fileContent.length : fileContent.byteLength,
      createdBy: userId,
      description: getArtifactDescription(detection.contentType, parsed)
    },
    description: getArtifactDescription(detection.contentType, parsed)
  })
```

**Helper Functions**:
```typescript
function getArtifactTitle(contentType: string, data: any): string {
  switch (contentType) {
    case 'email':
      return data?.subject || 'Email Template';
    case 'plan':
      return data?.expected_deliverable || data?.label || 'Outreach Plan';
    case 'research':
      return 'Research Data';
    default:
      return `Artifact - ${new Date().toLocaleDateString()}`;
  }
}

function getArtifactDescription(contentType: string, data: any): string {
  switch (contentType) {
    case 'email':
      return `Email template with subject: "${data?.subject || ''}"`;
    case 'plan':
      return data?.reasoning || 'Department outreach plan';
    case 'research':
      return 'Analyzed research data';
    default:
      return 'Generated artifact';
  }
}
```

**Time**: 20 minutes  
**Impact**: MEDIUM - Better artifact organization and searchability

---

### Part B: Create Artifacts Gallery/File Manager UI

#### Step B1: Create Artifacts Gallery Page Component

**File**: `src/pages/artifacts/ArtifactsPage.jsx`

**Features**:
- Grid view (like your screenshot)
- List view
- Thumbnail previews
- File type icons
- Download button
- Delete button
- Edit button (where applicable)
- Search/filter

```jsx
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import ArtifactCard from '../../components/ArtifactCard';
import ArtifactListView from '../../components/ArtifactListView';
import './ArtifactsPage.css';

export default function ArtifactsPage() {
  const [artifacts, setArtifacts] = useState([]);
  const [viewMode, setViewMode] = useState('grid'); // grid | list
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | excel | document | image
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchArtifacts();
  }, []);

  const fetchArtifacts = async () => {
    try {
      const response = await fetch('/api/artifacts');
      const result = await response.json();
      if (result.success) {
        setArtifacts(result.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch artifacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this artifact?')) return;
    
    try {
      const response = await fetch(`/api/artifacts/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setArtifacts(artifacts.filter(a => a.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete artifact:', error);
    }
  };

  const filteredArtifacts = artifacts
    .filter(a => !filter || filter === 'all' || a.artifact_type === filter)
    .filter(a => !searchTerm || a.title.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <>
      <Helmet>
        <title>Artifacts — Crost</title>
      </Helmet>

      <div className="artifacts-container">
        <div className="artifacts-header">
          <h1>Artifacts</h1>
          <p className="subtitle">Your generated files and outputs</p>
        </div>

        <div className="artifacts-controls">
          <input
            type="text"
            placeholder="Search artifacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />

          <div className="filter-buttons">
            {['all', 'document', 'excel', 'image'].map(f => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div className="view-toggle">
            <button
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              ⊞ Grid
            </button>
            <button
              className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              ☰ List
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading artifacts...</div>
        ) : filteredArtifacts.length === 0 ? (
          <div className="empty-state">
            <p>No artifacts yet</p>
            <p className="empty-subtitle">Artifacts will appear here when departments create them</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="artifacts-grid">
            {filteredArtifacts.map(artifact => (
              <ArtifactCard
                key={artifact.id}
                artifact={artifact}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="artifacts-list">
            {filteredArtifacts.map(artifact => (
              <ArtifactListView
                key={artifact.id}
                artifact={artifact}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
```

**Time**: 30 minutes  
**Impact**: HIGH - Creates entire artifacts interface

#### Step B2: Create Artifact Card Component

**File**: `src/components/ArtifactCard.jsx`

```jsx
import { getFileIcon, formatFileSize } from '../lib/artifact-utils';
import './ArtifactCard.css';

export default function ArtifactCard({ artifact, onDelete }) {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = artifact.file_url;
    link.download = artifact.title || 'artifact';
    link.click();
  };

  const handlePreview = () => {
    // Open in new tab for preview
    window.open(artifact.file_url, '_blank');
  };

  return (
    <div className="artifact-card">
      <div className="artifact-header">
        <div className="file-icon">{getFileIcon(artifact.artifact_type)}</div>
        <div className="artifact-info">
          <h3 className="artifact-title">{artifact.title}</h3>
          <p className="artifact-meta">
            {formatFileSize(artifact.metadata?.sizeBytes || 0)} • {artifact.artifact_type}
          </p>
        </div>
      </div>

      <p className="artifact-description">{artifact.metadata?.description || 'No description'}</p>

      <div className="artifact-footer">
        <span className="artifact-date">
          {new Date(artifact.created_at).toLocaleDateString()}
        </span>
      </div>

      <div className="artifact-actions">
        <button className="btn-preview" onClick={handlePreview} title="Preview">
          👁️ Preview
        </button>
        <button className="btn-download" onClick={handleDownload} title="Download">
          ⬇️ Download
        </button>
        <button
          className="btn-delete"
          onClick={() => onDelete(artifact.id)}
          title="Delete"
        >
          🗑️ Delete
        </button>
      </div>
    </div>
  );
}
```

**Time**: 15 minutes  
**Impact**: HIGH - Creates gallery card UI

#### Step B3: Create List View Component

**File**: `src/components/ArtifactListView.jsx`

```jsx
import { formatFileSize } from '../lib/artifact-utils';
import './ArtifactListView.css';

export default function ArtifactListView({ artifact, onDelete }) {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = artifact.file_url;
    link.download = artifact.title || 'artifact';
    link.click();
  };

  return (
    <div className="artifact-list-row">
      <div className="row-col name">
        <span className="file-icon">
          {artifact.artifact_type === 'document' ? '📄' : 
           artifact.artifact_type === 'excel' ? '📊' :
           artifact.artifact_type === 'image' ? '🖼️' : '📎'}
        </span>
        <div>
          <p className="row-title">{artifact.title}</p>
          <p className="row-subtitle">{artifact.metadata?.description}</p>
        </div>
      </div>

      <div className="row-col type">
        <span className="badge">{artifact.artifact_type}</span>
      </div>

      <div className="row-col size">
        {formatFileSize(artifact.metadata?.sizeBytes || 0)}
      </div>

      <div className="row-col date">
        {new Date(artifact.created_at).toLocaleDateString()}
      </div>

      <div className="row-col actions">
        <button
          className="btn-action"
          onClick={handleDownload}
          title="Download"
        >
          ⬇️
        </button>
        <button
          className="btn-action btn-danger"
          onClick={() => onDelete(artifact.id)}
          title="Delete"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
```

**Time**: 15 minutes  
**Impact**: MEDIUM - Creates list view alternative

#### Step B4: Create Styling

**File**: `src/pages/artifacts/ArtifactsPage.css`

```css
.artifacts-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 40px 24px;
  animation: fadeIn 0.6s var(--ease-out-expo);
}

.artifacts-header {
  margin-bottom: 40px;
}

.artifacts-header h1 {
  font-family: 'Fraunces', serif;
  font-size: clamp(32px, 5vw, 48px);
  font-weight: 700;
  margin-bottom: 8px;
  letter-spacing: -0.02em;
  color: var(--text);
}

.subtitle {
  color: var(--text2);
  font-size: 16px;
}

.artifacts-controls {
  display: flex;
  gap: 16px;
  margin-bottom: 32px;
  flex-wrap: wrap;
  align-items: center;
}

.search-input {
  flex: 1;
  min-width: 200px;
  padding: 12px 16px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 14px;
}

.search-input::placeholder {
  color: var(--text3);
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(0, 212, 170, 0.1);
}

.filter-buttons {
  display: flex;
  gap: 8px;
}

.filter-btn {
  padding: 10px 16px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text2);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.filter-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.filter-btn.active {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}

.view-toggle {
  display: flex;
  gap: 8px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px;
}

.view-btn {
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: var(--text2);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.view-btn:hover {
  color: var(--accent);
}

.view-btn.active {
  background: var(--bg3);
  color: var(--accent);
}

.artifacts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.empty-state {
  text-align: center;
  padding: 80px 24px;
}

.empty-state p {
  color: var(--text);
  font-size: 18px;
  margin-bottom: 8px;
}

.empty-subtitle {
  color: var(--text2);
  font-size: 14px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text2);
}

/* Responsive */
@media (max-width: 768px) {
  .artifacts-controls {
    flex-direction: column;
    gap: 12px;
  }

  .search-input {
    width: 100%;
  }

  .filter-buttons {
    width: 100%;
    overflow-x: auto;
  }

  .artifacts-grid {
    grid-template-columns: 1fr;
  }
}
```

**Time**: 20 minutes  
**Impact**: HIGH - Professional styling

#### Step B5: Create Artifact Utilities

**File**: `src/lib/artifact-utils.ts`

```typescript
export function getFileIcon(artifactType: string): string {
  switch (artifactType) {
    case 'document':
      return '📄';
    case 'excel':
      return '📊';
    case 'image':
      return '🖼️';
    case 'code':
      return '💻';
    case 'data':
      return '📈';
    default:
      return '📎';
  }
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export function getFileExtension(artifactType: string): string {
  switch (artifactType) {
    case 'document':
      return '.docx';
    case 'excel':
      return '.xlsx';
    case 'image':
      return '.png';
    case 'markdown':
      return '.md';
    default:
      return '';
  }
}
```

**Time**: 10 minutes  
**Impact**: LOW - Utility helpers

#### Step B6: Add Delete API Endpoint

**File**: `app/api/artifacts/[id]/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()

    // Get artifact to verify ownership and get file_url
    const { data: artifact, error: getErr } = await supabase
      .from('artifacts')
      .select('id, file_url')
      .eq('id', params.id)
      .eq('created_by', user.id)
      .single()

    if (getErr || !artifact) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
    }

    // Delete from Storage
    if (artifact.file_url) {
      const filePath = artifact.file_url.split('/artifacts/')[1]
      if (filePath) {
        await supabase.storage.from('artifacts').remove([filePath])
      }
    }

    // Delete from database
    const { error: deleteErr } = await supabase
      .from('artifacts')
      .delete()
      .eq('id', params.id)

    if (deleteErr) throw deleteErr

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/artifacts/:id]', err)
    return NextResponse.json({ error: 'Failed to delete artifact' }, { status: 500 })
  }
}
```

**Time**: 15 minutes  
**Impact**: MEDIUM - Enables delete functionality

---

## Implementation Checklist

### Phase 1: Fix Creation Pipeline (30 minutes)
- [ ] Fix line 80 in `app/api/worker/execute/route.ts` (use fileContent instead of content)
- [ ] Implement proper DOCX generation in `document-transformer.ts`
- [ ] Enhance artifact metadata storage in worker endpoint
- [ ] Test artifact creation with Excel output
- [ ] Verify artifacts appear in database

### Phase 2: Create Gallery UI (90 minutes)
- [ ] Create ArtifactsPage component
- [ ] Create ArtifactCard component
- [ ] Create ArtifactListView component
- [ ] Add styling (CSS files)
- [ ] Create utility functions
- [ ] Add delete endpoint

### Phase 3: Integration (30 minutes)
- [ ] Add artifacts route to App.jsx
- [ ] Link from dashboard/sidebar to artifacts
- [ ] Test all features:
  - [  ] Download artifacts
  - [ ] Delete artifacts
  - [ ] Filter by type
  - [ ] Search by name
  - [ ] Toggle grid/list view
- [ ] Test on mobile

### Phase 4: Testing (30 minutes)
- [ ] Create Excel task → verify .xlsx file created
- [ ] Create email task → verify .docx file created
- [ ] Create plan task → verify .md file created
- [ ] Download each artifact → verify file integrity
- [ ] Delete artifact → verify removed from gallery
- [ ] Search/filter → verify works correctly

---

## File Structure After Implementation

```
frontend/
├── app/api/artifacts/
│   ├── route.ts (existing)
│   └── [id]/
│       └── route.ts (NEW - delete endpoint)
├── lib/
│   ├── artifact-transformers/ (existing)
│   │   ├── index.ts
│   │   ├── excel-transformer.ts
│   │   ├── document-transformer.ts
│   │   ├── markdown-transformer.ts
│   │   └── email-transformer.ts
│   └── artifact-utils.ts (NEW)
└── src/
    ├── pages/
    │   └── artifacts/ (NEW)
    │       ├── ArtifactsPage.jsx
    │       └── ArtifactsPage.css
    └── components/
        ├── ArtifactCard.jsx (NEW)
        ├── ArtifactCard.css (NEW)
        ├── ArtifactListView.jsx (NEW)
        └── ArtifactListView.css (NEW)
```

---

## Success Criteria

✅ Excel task creates actual .xlsx file  
✅ Email task creates actual .docx file  
✅ Plan task creates actual .md file  
✅ Files downloadable from artifacts page  
✅ Users can delete artifacts  
✅ Gallery shows all artifacts with proper icons  
✅ Can filter by file type  
✅ Can search by title  
✅ Can toggle between grid/list view  
✅ Responsive on mobile  
✅ No 404 errors  

---

## Timeline

| Component | Time | Status |
|-----------|------|--------|
| Fix upload bug | 5 min | Critical |
| Improve transformers | 15 min | Critical |
| Metadata storage | 20 min | Important |
| Gallery page | 30 min | Important |
| Card component | 15 min | Important |
| List view | 15 min | Nice-to-have |
| Styling | 20 min | Important |
| Delete endpoint | 15 min | Important |
| Testing | 30 min | Critical |
| **Total** | **165 min** | **~3 hours** |

---

## Recommendation

**Proceed in this order:**

1. **Fix the upload bug first** (5 min) - Without this, nothing works
2. **Improve transformers** (15 min) - Needed to generate proper files
3. **Create gallery components** (60 min) - Users can see/manage artifacts
4. **Add delete endpoint** (15 min) - Complete artifact management
5. **Test everything** (30 min) - Ensure no broken links

**Priority**: This is HIGH PRIORITY - Your artifact system is completely broken right now.

