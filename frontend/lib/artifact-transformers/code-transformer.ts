/**
 * Code Transformer — Crost Skills Layer §9.5
 * 
 * Transforms technical "code" skill JSON into a clean source file string.
 * Supports python, sql, typescript, css, etc.
 */

/** True when the payload carries a multi-file code bundle: { files: [{ filename, code }] } */
export function hasCodeFiles(data: any): boolean {
  return Array.isArray(data?.files) && data.files.some((f: any) => f && typeof (f.code ?? f.content) === 'string')
}

/**
 * Multi-file bundle → one readable Markdown file (title, summary, then each file
 * in a fenced block). Previously the `files` array was ignored and the download
 * contained only header comments.
 */
function transformCodeBundle(data: any): string {
  const out: string[] = []
  if (typeof data.title === 'string' && data.title.trim()) out.push(`# ${data.title.trim()}`, '')
  if (typeof data.summary === 'string' && data.summary.trim()) out.push(data.summary.trim(), '')
  for (const f of data.files) {
    const code = typeof f?.code === 'string' ? f.code : typeof f?.content === 'string' ? f.content : null
    if (code === null) continue
    const name = f.filename || f.file_name || f.name || f.path || 'file'
    const lang = (f.language || String(name).split('.').pop() || '').toLowerCase()
    out.push(`## ${name}`, '', '```' + lang, code.replace(/\s+$/, ''), '```', '')
  }
  return out.join('\n')
}

export async function transformToCode(data: any): Promise<string> {
  if (hasCodeFiles(data)) return transformCodeBundle(data)

  const lines: string[] = []

  if (data.file_name) {
    lines.push(`// FILE: ${data.file_name}`)
  }
  if (data.language) {
    lines.push(`// LANGUAGE: ${data.language}`)
  }
  if (data.description) {
    lines.push(`// DESCRIPTION: ${data.description}`)
  }
  
  lines.push('') // Gap
  
  if (data.code) {
    lines.push(data.code)
  }

  if (data.documentation) {
    lines.push('')
    lines.push('// ─── DOCUMENTATION ───────────────────────────────────────────────────────────')
    lines.push('')
    // Wrap documentation in comments to keep it in a single "source" file
    const docLines = data.documentation.split('\n')
    docLines.forEach((line: string) => lines.push(`// ${line}`))
  }

  return lines.join('\n')
}
