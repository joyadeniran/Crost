import { describe, it, expect } from 'vitest'
import { toReadableView, displayTitle, downloadFileName, fileExtension } from '@/lib/artifact-view'

describe('toReadableView', () => {
  it('maps copy sections to headings + text with no raw JSON', () => {
    const body = JSON.stringify({
      status: 'completed',
      title: 'Copy',
      summary: 'Drafted the copy.',
      sections: [{ heading: 'Hero Section', content: 'Headline: Bring teams together.' }],
    })
    const v = toReadableView(body)
    expect(v.summary).toBe('Drafted the copy.')
    expect(v.sections).toEqual([{ heading: 'Hero Section', text: 'Headline: Bring teams together.' }])
    expect(JSON.stringify(v)).not.toContain('"status"')
  })

  it('extracts code files', () => {
    const v = toReadableView('```json\n' + JSON.stringify({ summary: 's', files: [{ filename: 'index.html', language: 'html', code: '<p/>' }] }) + '\n```')
    expect(v.files).toEqual([{ name: 'index.html', language: 'html', code: '<p/>' }])
  })

  it('renders unknown nested JSON as labelled text, never braces', () => {
    const v = toReadableView(JSON.stringify({ plan: { budget_split: ['ads', 'content'] } }))
    const text = v.sections.map(s => `${s.heading}\n${s.text}`).join('\n')
    expect(text).toContain('Plan')
    expect(text).toContain('• ads')
    expect(text).not.toMatch(/[{}"]/)
  })

  it('passes plain text through and handles empty bodies', () => {
    expect(toReadableView('Hello').sections).toEqual([{ text: 'Hello' }])
    expect(toReadableView(null)).toEqual({ sections: [], files: [] })
  })
})

describe('display helpers', () => {
  it('strips the "Output:" prefix', () => {
    expect(displayTitle('Output: Draft landing page copy')).toBe('Draft landing page copy')
  })
  it('builds a clean download name instead of the timestamped storage key', () => {
    const url = 'https://x.supabase.co/storage/v1/object/public/artifacts/goals/g/draft-landing-page-copy-and-structure-1790978637867.xlsx'
    expect(fileExtension(url)).toBe('xlsx')
    expect(downloadFileName('Output: Draft landing page copy', 'xlsx')).toBe('draft-landing-page-copy.xlsx')
  })
})
