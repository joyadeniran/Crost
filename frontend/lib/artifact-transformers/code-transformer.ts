/**
 * Code Transformer — Crost Skills Layer §9.5
 * 
 * Transforms technical "code" skill JSON into a clean source file string.
 * Supports python, sql, typescript, css, etc.
 */

export async function transformToCode(data: any): Promise<string> {
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
