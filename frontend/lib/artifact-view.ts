// lib/artifact-view.ts
//
// Turns a stored artifact body (usually the department's raw JSON output) into a
// plain, readable view for the Deliverables panel. Invariant #4: raw tool/LLM JSON
// never reaches the UI — anything we can't map to text is dropped, not dumped.

export interface ReadableSection {
  heading?: string
  text: string
}

export interface ReadableFile {
  name: string
  language?: string
  code: string
}

export interface ReadableView {
  summary?: string
  sections: ReadableSection[]
  files: ReadableFile[]
}

const SKIP_KEYS = new Set([
  'status', 'title', 'summary', 'skill', 'format', 'department', 'task_id',
  'sources', 'needs_more_data', 'missing_data', 'action', 'files', 'sections',
])
const HEADING_KEYS = ['heading', 'title', 'name', 'section', 'label']
const TEXT_KEYS = ['content', 'body', 'text', 'copy', 'description', 'details']

function stripFences(raw: string): string {
  return raw.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
}

function humanizeKey(key: string): string {
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

/** Render any JSON value as indented plain text (no braces, no quotes). */
function toText(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const pad = '  '.repeat(depth)
  if (Array.isArray(value)) {
    return value
      .map(v => {
        const t = toText(v, depth + 1)
        return t ? `${pad}• ${t.trimStart()}` : ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const t = toText(v, depth + 1)
        if (!t) return ''
        return typeof v === 'object' ? `${pad}${humanizeKey(k)}:\n${t}` : `${pad}${humanizeKey(k)}: ${t}`
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function toSection(item: unknown, fallbackHeading?: string): ReadableSection | null {
  if (typeof item === 'string') return item.trim() ? { heading: fallbackHeading, text: item.trim() } : null
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>
    const heading = pickString(obj, HEADING_KEYS) ?? fallbackHeading
    const text = pickString(obj, TEXT_KEYS)
    if (text) return { heading, text }
    const rest = Object.fromEntries(Object.entries(obj).filter(([k]) => !HEADING_KEYS.includes(k)))
    const t = toText(rest)
    return t ? { heading, text: t } : null
  }
  const t = toText(item)
  return t ? { heading: fallbackHeading, text: t } : null
}

export function toReadableView(body: string | null | undefined): ReadableView {
  const view: ReadableView = { sections: [], files: [] }
  if (!body || !body.trim()) return view

  const stripped = stripFences(body)
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    // Plain text / markdown — show as-is.
    view.sections.push({ text: stripped })
    return view
  }

  if (typeof parsed === 'string') {
    view.sections.push({ text: parsed })
    return view
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const s = toSection(item)
      if (s) view.sections.push(s)
    }
    return view
  }
  if (!parsed || typeof parsed !== 'object') return view

  const obj = parsed as Record<string, unknown>
  if (typeof obj.summary === 'string' && obj.summary.trim()) view.summary = obj.summary.trim()

  // Code deliverables: { files: [{ filename, language, code }] } or { file_name, code }
  const rawFiles = Array.isArray(obj.files) ? obj.files : []
  for (const f of rawFiles) {
    if (!f || typeof f !== 'object') continue
    const fo = f as Record<string, unknown>
    const code = typeof fo.code === 'string' ? fo.code : typeof fo.content === 'string' ? fo.content : ''
    if (!code) continue
    view.files.push({
      name: pickString(fo, ['filename', 'file_name', 'name', 'path']) ?? `file-${view.files.length + 1}`,
      language: pickString(fo, ['language', 'lang']),
      code,
    })
  }
  if (!rawFiles.length && typeof obj.code === 'string' && obj.code.trim()) {
    view.files.push({
      name: pickString(obj, ['file_name', 'filename']) ?? 'code',
      language: pickString(obj, ['language']),
      code: obj.code,
    })
  }

  if (Array.isArray(obj.sections)) {
    for (const item of obj.sections) {
      const s = toSection(item)
      if (s) view.sections.push(s)
    }
  } else if (obj.sections && typeof obj.sections === 'object') {
    for (const [k, v] of Object.entries(obj.sections as Record<string, unknown>)) {
      const s = toSection(v, humanizeKey(k))
      if (s) view.sections.push(s)
    }
  }

  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_KEYS.has(k) || k === 'code' || k === 'file_name' || k === 'language') continue
    const t = toText(v)
    if (t) view.sections.push({ heading: humanizeKey(k), text: t })
  }

  return view
}

/** "Output: Draft landing page copy" → "Draft landing page copy" */
export function displayTitle(title: string | null | undefined): string {
  return (title ?? '').replace(/^\s*(output|department output)\s*:\s*/i, '').trim() || 'Untitled deliverable'
}

/** Extension of the stored file ("xlsx", "docx", "md"...), or null when there is no file. */
export function fileExtension(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null
  const last = fileUrl.split('?')[0].split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : null
}

/** Clean download name built from the title, never the timestamped storage key. */
export function downloadFileName(title: string | null | undefined, ext: string | null): string {
  const base = displayTitle(title)
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80) || 'deliverable'
  return ext ? `${base}.${ext}` : base
}
