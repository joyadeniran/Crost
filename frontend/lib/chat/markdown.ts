// lib/chat/markdown.ts — tiny, safe markdown → HTML for chat replies.
// Everything is HTML-escaped first; only a fixed set of tags is produced, and links must be http(s).
// Supports: paragraphs, line breaks, # headings, - / * / 1. lists, ``` code blocks, `code`, **bold**,
// *italic*, [text](https://url).

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function inline(s: string): string {
  let out = esc(s)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`)
  return out
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let para: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null

  const flushPara = () => {
    if (para.length) html.push(`<p>${para.map(inline).join('<br/>')}</p>`)
    para = []
  }
  const flushList = () => {
    if (list) html.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`)
    list = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().startsWith('```')) {
      flushPara(); flushList()
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++])
      html.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`)
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) { flushPara(); flushList(); html.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`); continue }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ul || ol) {
      flushPara()
      const type = ul ? 'ul' : 'ol'
      if (!list || list.type !== type) { flushList(); list = { type, items: [] } }
      list.items.push((ul ?? ol)![1])
      continue
    }
    if (!line.trim()) { flushPara(); flushList(); continue }
    flushList()
    para.push(line)
  }
  flushPara(); flushList()
  return html.join('')
}
