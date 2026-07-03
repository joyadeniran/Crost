/**
 * Unit tests: lib/knowledge/extract-text.ts — extractText dispatch + local parsers.
 * pdf-parse/mammoth/xlsx are real (lightweight, deterministic on our fixtures);
 * only the LLM vision fallback (@/lib/llm-client) is mocked.
 *
 * Forced to the 'node' environment (not jsdom): pdf-parse's pdfjs-dist dependency
 * probes for browser globals (DOMMatrix) and takes an unsupported code path when
 * `window` exists but is incomplete, as jsdom's is.
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'

const { callLLMMock, getModelMock } = vi.hoisted(() => ({
  callLLMMock: vi.fn(),
  getModelMock: vi.fn(() => Promise.resolve({ model: 'groq/llama-3.3-70b-versatile' })),
}))

vi.mock('@/lib/llm-client', () => ({
  callLLM: (...args: any[]) => callLLMMock(...args),
  getModel: (...args: any[]) => getModelMock(...args),
}))

import { extractText } from '@/lib/knowledge/extract-text'

beforeEach(() => {
  callLLMMock.mockReset()
})

describe('extractText — routing', () => {
  it('routes images straight to LLM vision extraction', async () => {
    callLLMMock.mockResolvedValueOnce({ content: 'ocr text from image' })
    const result = await extractText(Buffer.from('fake'), 'image/png', 'photo.png')
    expect(result.method).toBe('llm_vision')
    expect(result.text).toBe('ocr text from image')
  })

  it('routes .txt files to native extraction', async () => {
    const result = await extractText(Buffer.from('hello world'), 'text/plain', 'notes.txt')
    expect(result.method).toBe('native')
    expect(result.text).toBe('hello world')
  })

  it('routes .json files to native extraction with pretty-printing', async () => {
    const result = await extractText(Buffer.from('{"a":1}'), 'application/json', 'data.json')
    expect(result.method).toBe('native')
    expect(result.text).toContain('"a": 1')
  })

  it('falls back to raw text when JSON parsing fails', async () => {
    const result = await extractText(Buffer.from('{not valid json'), 'application/json', 'bad.json')
    expect(result.text).toBe('{not valid json')
  })

  it('routes unknown extensions with short native text to LLM vision fallback', async () => {
    callLLMMock.mockResolvedValueOnce({ content: 'x'.repeat(150) })
    const result = await extractText(Buffer.from('ab'), 'application/octet-stream', 'file.xyz')
    expect(result.method).toBe('llm_vision')
  })

  it('routes unknown extensions with long native text to native (no LLM fallback)', async () => {
    const longText = 'x'.repeat(400)
    const result = await extractText(Buffer.from(longText), 'application/octet-stream', 'file.xyz')
    expect(result.method).toBe('native')
    expect(callLLMMock).not.toHaveBeenCalled()
  })
})

describe('extractText — PDF (invalid buffer, real pdf-parse)', () => {
  it('escalates to LLM vision when the buffer is not a valid PDF (pdf-parse throws)', async () => {
    callLLMMock.mockResolvedValueOnce({ content: 'recovered text' })
    const result = await extractText(Buffer.from('not a real pdf'), 'application/pdf', 'corrupt.pdf')
    expect(result.method).toBe('llm_vision')
    expect(result.text).toBe('recovered text')
  })
})

describe('extractText — DOCX (invalid buffer, real mammoth)', () => {
  it('escalates to LLM vision when the buffer is not a valid docx (mammoth throws or returns empty)', async () => {
    callLLMMock.mockResolvedValueOnce({ content: 'x'.repeat(150) })
    const result = await extractText(
      Buffer.from('not a real docx'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'bad.docx',
    )
    expect(result.method).toBe('llm_vision')
  })
})

describe('extractText — spreadsheet (real xlsx)', () => {
  it('joins CSV output for each sheet with a header, using a real workbook buffer', async () => {
    const wb = XLSX.utils.book_new()
    const ws1 = XLSX.utils.aoa_to_sheet([['a', 'b'], [1, 2]])
    const ws2 = XLSX.utils.aoa_to_sheet([['c', 'd'], [3, 4]])
    XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1')
    XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const result = await extractText(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'data.xlsx')
    expect(result.method).toBe('local')
    expect(result.confidence).toBe('high')
    expect(result.text).toContain('=== Sheet: Sheet1 ===')
    expect(result.text).toContain('=== Sheet: Sheet2 ===')
    expect(result.text).toContain('a,b')
  })

  it('parses a real CSV buffer', async () => {
    const result = await extractText(Buffer.from('a,b\n1,2\n3,4'), 'text/csv', 'data.csv')
    expect(result.method).toBe('local')
    expect(result.text).toContain('1,2')
  })

  // FIXED (phase-6, was KNOWN-BUG(phase-1)): extractSpreadsheet's catch
  // branch (low confidence + "Spreadsheet parse failed" warning) was
  // effectively unreachable in practice — SheetJS's XLSX.read() is lenient
  // across format detectors and does not throw even on garbage/empty
  // buffers; it silently returns a workbook with zero (or empty) sheets
  // instead, and the function reported "high" confidence regardless. Root
  // cause: confidence was set unconditionally on the non-throw path, never
  // checking whether any content was actually extracted. Fixed by
  // explicitly detecting the empty-content case and downgrading confidence
  // + adding a warning, rather than relying on XLSX.read() throwing (which
  // it doesn't). See docs/BASELINE.md for the original characterization.
  it('downgrades to "low" confidence with a warning for an unparseable/empty buffer (SheetJS does not throw, so this is detected explicitly)', async () => {
    const result = await extractText(Buffer.alloc(0), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'empty.xlsx')
    expect(result.method).toBe('local')
    expect(result.confidence).toBe('low')
    expect(result.warnings).toBeDefined()
    expect(result.warnings![0]).toMatch(/no (readable )?content|empty/i)
  })
})

describe('extractText — LLM vision failure path', () => {
  it('returns low confidence empty text when the LLM call throws', async () => {
    callLLMMock.mockRejectedValueOnce(new Error('llm down'))
    const result = await extractText(Buffer.from('img'), 'image/jpeg', 'photo.jpg')
    expect(result.method).toBe('llm_vision')
    expect(result.confidence).toBe('low')
    expect(result.text).toBe('')
    expect(result.warnings?.[0]).toMatch(/LLM Vision extraction failed/)
  })
})
