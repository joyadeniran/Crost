'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';

type KBFile = {
  id: string;
  title: string;
  file_name: string;
  file_type: string;
  mime_type: string;
  category: string;
  tags: string[];
  extracted_summary: string;
  processing_status: string;
  reference_count: number;
  created_at: string;
};

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'company_profile', label: 'Company Profile' },
  { value: 'pitch_deck', label: 'Pitch Deck' },
  { value: 'financial_report', label: 'Financial Report' },
  { value: 'handbook', label: 'Handbook' },
  { value: 'meeting_notes', label: 'Meeting Notes' },
  { value: 'research', label: 'Research' },
  { value: 'legal', label: 'Legal' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'sales', label: 'Sales' },
  { value: 'product', label: 'Product' },
  { value: 'operations', label: 'Operations' },
  { value: 'custom', label: 'Custom' },
];

const FILE_ICONS: Record<string, string> = {
  pdf: '📄', docx: '📝', xlsx: '📊', csv: '📊',
  txt: '📃', md: '📃', json: '🔧',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', webp: '🖼️', gif: '🖼️',
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Queued', color: '#888' },
  processing: { label: 'Extracting...', color: '#f59e0b' },
  completed: { label: 'Ready', color: '#00D4AA' },
  failed: { label: 'Failed', color: '#ef4444' },
};

export default function KnowledgePage() {
  const [files, setFiles] = useState<KBFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [selectedFile, setSelectedFile] = useState<KBFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('custom');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  // Mid-task upload flow: when arriving from a blocked mission task, the
  // goalId query param ties this upload to that goal so its needs_data tasks
  // auto-resume after processing. Read from window to avoid a Suspense
  // boundary for useSearchParams.
  const [resumeGoalId, setResumeGoalId] = useState('');
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('goalId');
    if (p) setResumeGoalId(p);
  }, []);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (query) params.set('query', query);
      if (category) params.set('category', category);
      const res = await fetch(`/api/knowledge/files?${params.toString()}`);
      const data = await res.json();
      setFiles(data.files || []);
      setHasFetched(true);
    } finally {
      setLoading(false);
    }
  }, [query, category]);

  // Initial load
  if (!hasFetched && !loading) fetchFiles();

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setPendingFile(dropped);
      setUploadTitle(dropped.name.replace(/\.[^/.]+$/, ''));
    }
  }, []);

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setUploadProgress('Uploading...');
    try {
      const form = new FormData();
      form.append('file', pendingFile);
      form.append('title', uploadTitle || pendingFile.name);
      form.append('category', uploadCategory);
      if (resumeGoalId) form.append('goal_id', resumeGoalId);

      const res = await fetch('/api/knowledge/upload', { method: 'POST', body: form });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setPendingFile(null);
      setUploadTitle('');
      setUploadCategory('custom');
      setUploadProgress('');
      setSuccessMessage(resumeGoalId
        ? 'File uploaded. Once processing finishes, your blocked mission task will resume automatically — you can head back to Mission Control.'
        : 'File uploaded. Text extraction is running in the background — it will appear as "Ready" shortly.');
      setTimeout(() => { setSuccessMessage(''); fetchFiles(); }, 6000);
    } catch (err: any) {
      setUploadProgress(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!fileToDelete) return;
    await fetch(`/api/knowledge/files?id=${fileToDelete}`, { method: 'DELETE' });
    setFiles(prev => prev.filter(f => f.id !== fileToDelete));
    if (selectedFile?.id === fileToDelete) setSelectedFile(null);
    setFileToDelete(null);
  };

  return (
    <div className="knowledge-page">
      {resumeGoalId && (
        <div style={{
          padding: '10px 14px', marginBottom: 12, borderRadius: 8,
          background: '#60a5fa1a', border: '1px solid #60a5fa55',
          fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <span>You're uploading data for a blocked mission task. It will resume automatically once processing finishes.</span>
          <a href="/dashboard" style={{ color: '#60a5fa', textDecoration: 'none', whiteSpace: 'nowrap' }}>← Back to Mission Control</a>
        </div>
      )}
      <ConfirmationModal
        isOpen={!!fileToDelete}
        title="Delete File"
        message="Are you sure you want to delete this file from your Knowledge Base? This action cannot be undone."
        confirmLabel="Yes, Delete"
        onConfirm={handleDelete}
        onCancel={() => setFileToDelete(null)}
        isDanger
      />
      <div className="knowledge-header">
        <div>
          <h1 className="knowledge-title">Knowledge Base</h1>
          <p className="knowledge-subtitle">Give Crost deeper context about your company. Upload anything — docs, reports, handbooks, pitch decks.</p>
        </div>
        <div className="kb-stats">
          <span className="kb-stat">{files.length} files</span>
          <span className="kb-stat">{files.filter(f => f.processing_status === 'completed').length} ready</span>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        className={`kb-upload-zone ${dragging ? 'kb-upload-zone--dragging' : ''} ${pendingFile ? 'kb-upload-zone--has-file' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !pendingFile && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.json,.png,.jpg,.jpeg,.webp"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) { setPendingFile(f); setUploadTitle(f.name.replace(/\.[^/.]+$/, '')); }
          }}
        />
        {!pendingFile ? (
          <div className="kb-upload-prompt">
            <div className="kb-upload-icon">📂</div>
            <p className="kb-upload-text">Drop a file or click to browse</p>
            <p className="kb-upload-hint">PDF, DOCX, XLSX, CSV, TXT, MD, JSON, Images · Max 25MB</p>
          </div>
        ) : (
          <div className="kb-upload-form" onClick={e => e.stopPropagation()}>
            <div className="kb-upload-file-info">
              <span className="kb-file-icon">{FILE_ICONS[pendingFile.name.split('.').pop()?.toLowerCase() || ''] || '📄'}</span>
              <div>
                <p className="kb-upload-fname">{pendingFile.name}</p>
                <p className="kb-upload-fsize">{(pendingFile.size / 1024).toFixed(1)} KB</p>
              </div>
              <button className="kb-clear-btn" onClick={() => setPendingFile(null)}>✕</button>
            </div>
            <input
              className="kb-meta-input"
              placeholder="Title (optional)"
              value={uploadTitle}
              onChange={e => setUploadTitle(e.target.value)}
            />
            <select
              className="kb-meta-select"
              value={uploadCategory}
              onChange={e => setUploadCategory(e.target.value)}
            >
              {CATEGORIES.slice(1).map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <button
              className="kb-upload-btn"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Upload to Knowledge Base'}
            </button>
            {uploadProgress && <p className="kb-upload-progress">{uploadProgress}</p>}
          </div>
        )}
      </div>

      {/* Upload success banner */}
      {successMessage && (
        <div style={{
          background: 'rgba(0, 212, 170, 0.12)',
          border: '1px solid rgba(0, 212, 170, 0.35)',
          borderRadius: '8px',
          padding: '12px 16px',
          color: '#00D4AA',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span>✓</span>
          <span>{successMessage}</span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="kb-toolbar">
        <input
          className="kb-search-input"
          placeholder="Search by title, content, or summary..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchFiles()}
        />
        <select
          className="kb-category-filter"
          value={category}
          onChange={e => { setCategory(e.target.value); }}
        >
          {CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <button className="kb-search-btn" onClick={fetchFiles}>Search</button>
      </div>

      {/* Library Grid */}
      <div className="kb-library">
        {loading && <div className="kb-loading">Loading files...</div>}
        {!loading && files.length === 0 && hasFetched && (
          <div className="kb-empty">
            <p>No files yet. Upload your first document above to get started.</p>
          </div>
        )}
        {files.map(file => {
          const icon = FILE_ICONS[file.file_type] || '📄';
          const status = STATUS_CONFIG[file.processing_status] || STATUS_CONFIG.pending;
          return (
            <div
              key={file.id}
              className={`kb-card ${selectedFile?.id === file.id ? 'kb-card--selected' : ''}`}
              onClick={() => setSelectedFile(file)}
            >
              <div className="kb-card-top">
                <span className="kb-card-icon">{icon}</span>
                <span className="kb-card-status" style={{ color: status.color }}>{status.label}</span>
              </div>
              <h3 className="kb-card-title">{file.title}</h3>
              <p className="kb-card-category">{CATEGORIES.find(c => c.value === file.category)?.label || file.category}</p>
              {file.extracted_summary && (
                <p className="kb-card-summary">{file.extracted_summary.slice(0, 100)}...</p>
              )}
              <div className="kb-card-tags">
                {(file.tags || []).slice(0, 3).map(tag => (
                  <span key={tag} className="kb-tag">{tag}</span>
                ))}
              </div>
              <div className="kb-card-footer">
                <span className="kb-card-refs">📎 Used {file.reference_count}x</span>
                <button
                  className="kb-delete-btn"
                  onClick={e => { e.stopPropagation(); setFileToDelete(file.id); }}
                >Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Drawer */}
      {selectedFile && (
        <div className="kb-drawer-overlay" onClick={() => setSelectedFile(null)}>
          <div className="kb-drawer" onClick={e => e.stopPropagation()}>
            <div className="kb-drawer-header">
              <div className="kb-drawer-title-row">
                <span className="kb-drawer-icon">
                  {FILE_ICONS[selectedFile.file_type] || '📄'}
                </span>
                <div>
                  <h2 className="kb-drawer-title">{selectedFile.title}</h2>
                  <p className="kb-drawer-meta">{selectedFile.file_name} · {CATEGORIES.find(c => c.value === selectedFile.category)?.label}</p>
                </div>
              </div>
              <button className="kb-drawer-close" onClick={() => setSelectedFile(null)}>✕</button>
            </div>

            <div className="kb-drawer-body">
              {selectedFile.extracted_summary && (
                <div className="kb-drawer-section">
                  <h3 className="kb-drawer-section-title">AI Summary</h3>
                  <p className="kb-drawer-summary">{selectedFile.extracted_summary}</p>
                </div>
              )}

              <div className="kb-drawer-section">
                <h3 className="kb-drawer-section-title">Tags</h3>
                <div className="kb-card-tags">
                  {(selectedFile.tags || []).map(tag => (
                    <span key={tag} className="kb-tag">{tag}</span>
                  ))}
                  {(!selectedFile.tags || selectedFile.tags.length === 0) && (
                    <span className="kb-tag-empty">No tags yet</span>
                  )}
                </div>
              </div>

              <div className="kb-drawer-section">
                <h3 className="kb-drawer-section-title">Usage Insights</h3>
                <div className="kb-drawer-insights">
                  <div className="kb-insight">
                    <span className="kb-insight-icon">📎</span>
                    <span>Referenced by Orc/departments <strong>{selectedFile.reference_count}</strong> times</span>
                  </div>
                  <div className="kb-insight">
                    <span className="kb-insight-icon">🗓️</span>
                    <span>Added {new Date(selectedFile.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>

              <div className="kb-drawer-section">
                <h3 className="kb-drawer-section-title">Processing Status</h3>
                <div
                  className="kb-drawer-status"
                  style={{ color: STATUS_CONFIG[selectedFile.processing_status]?.color || '#888' }}
                >
                  ● {STATUS_CONFIG[selectedFile.processing_status]?.label || selectedFile.processing_status}
                </div>
              </div>
            </div>

            <div className="kb-drawer-footer">
              <button className="kb-drawer-delete" onClick={() => setFileToDelete(selectedFile.id)}>
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
