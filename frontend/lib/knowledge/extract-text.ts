// lib/knowledge/extract-text.ts
// Hybrid text extraction engine.
// Default: local parsers (pdf-parse, mammoth, xlsx, node native)
// Fallback: LLM vision extraction via existing LiteLLM gateway
// All LLM calls go through lib/llm-client.ts for BYOK + usage logging.

// eslint-disable-next-line
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export type ExtractionResult = {
  text: string;
  method: 'local' | 'llm_vision' | 'native';
  confidence: 'high' | 'low';
  pageCount?: number;
  warnings?: string[];
};

const POOR_EXTRACTION_THRESHOLD = 300; // chars

// ─── PUBLIC ENTRY POINT ────────────────────────────────────────────

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  userId?: string        // passed through for LLM fallback token logging
): Promise<ExtractionResult> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  // 1. Images → always LLM Vision
  if (mimeType.startsWith('image/')) {
    return await llmVisionExtract(buffer, mimeType, userId);
  }

  // 2. PDF → local first, LLM fallback on poor quality
  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return await extractPdf(buffer, userId);
  }

  // 3. DOCX → mammoth
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    return await extractDocx(buffer, userId);
  }

  // 4. XLSX / CSV → xlsx
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'text/csv' ||
    ext === 'xlsx' ||
    ext === 'csv'
  ) {
    return extractSpreadsheet(buffer, ext);
  }

  // 5. TXT / MD / JSON → native
  if (['txt', 'md', 'json', 'markdown'].includes(ext) || mimeType.startsWith('text/')) {
    return extractNative(buffer, ext);
  }

  // 6. Unknown → attempt native, LLM fallback if poor
  const native = extractNative(buffer, ext);
  if (native.text.length < POOR_EXTRACTION_THRESHOLD) {
    return await llmVisionExtract(buffer, mimeType, userId);
  }
  return native;
}

// ─── LOCAL PARSERS ──────────────────────────────────────────────────

async function extractPdf(buffer: Buffer, userId?: string): Promise<ExtractionResult> {
  try {
    const data = await pdfParse(buffer);
    const text = data.text?.trim() || '';

    if (text.length >= POOR_EXTRACTION_THRESHOLD) {
      return {
        text,
        method: 'local',
        confidence: 'high',
        pageCount: data.numpages,
      };
    }

    // Scanned / image-heavy PDF → LLM Vision fallback
    console.log('[KB Extractor] PDF text too short, escalating to LLM Vision');
    return await llmVisionExtract(buffer, 'application/pdf', userId);
  } catch (err) {
    console.error('[KB Extractor] pdf-parse failed, falling back to LLM:', err);
    return await llmVisionExtract(buffer, 'application/pdf', userId);
  }
}

async function extractDocx(buffer: Buffer, userId?: string): Promise<ExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value?.trim() || '';

    if (text.length >= POOR_EXTRACTION_THRESHOLD) {
      return {
        text,
        method: 'local',
        confidence: 'high',
        warnings: result.messages.map((m) => m.message),
      };
    }

    return await llmVisionExtract(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', userId);
  } catch (err) {
    console.error('[KB Extractor] mammoth failed, falling back to LLM:', err);
    return await llmVisionExtract(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', userId);
  }
}

function extractSpreadsheet(buffer: Buffer, ext: string): ExtractionResult {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const lines: string[] = [];
    let hasContent = false;
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim().length > 0) hasContent = true;
      lines.push(`=== Sheet: ${sheetName} ===\n${csv}`);
    }
    // Phase 6 fix (was KNOWN-BUG(phase-1)): XLSX.read() is lenient and does
    // not throw on garbage/empty buffers — it silently returns a workbook
    // with zero sheets, or sheets with no rows, instead. The catch branch
    // below was written to signal a failed extraction but was effectively
    // unreachable, so a genuinely unparseable file was reported as "high"
    // confidence with essentially no content. Detect that case explicitly.
    if (!hasContent) {
      return {
        text: lines.join('\n\n'),
        method: 'local',
        confidence: 'low',
        warnings: ['Spreadsheet parse produced no readable content — file may be empty, corrupted, or in an unsupported format.'],
      };
    }
    return {
      text: lines.join('\n\n'),
      method: 'local',
      confidence: 'high',
    };
  } catch (err) {
    return {
      text: '',
      method: 'local',
      confidence: 'low',
      warnings: [`Spreadsheet parse failed: ${(err as Error).message}`],
    };
  }
}

function extractNative(buffer: Buffer, ext: string): ExtractionResult {
  try {
    const raw = buffer.toString('utf-8');
    let text = raw;

    if (ext === 'json') {
      try {
        const parsed = JSON.parse(raw);
        text = JSON.stringify(parsed, null, 2);
      } catch {
        text = raw;
      }
    }

    return {
      text: text.trim(),
      method: 'native',
      confidence: text.length > 50 ? 'high' : 'low',
    };
  } catch {
    return { text: '', method: 'native', confidence: 'low' };
  }
}

// ─── LLM VISION FALLBACK ────────────────────────────────────────────

async function llmVisionExtract(
  buffer: Buffer,
  mimeType: string,
  userId?: string
): Promise<ExtractionResult> {
  try {
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const { callLLM, getModel } = await import('@/lib/llm-client');
    const { model } = await getModel('summarization', userId);

    // LLM vision models need multimodal content; we pass the image as a URL in the text prompt
    const prompt = `The following is a base64-encoded document (${mimeType}): ${dataUrl}\n\nExtract all readable text from this document. Return only the raw text, preserving structure. Do not add commentary.`;
    const systemNote = 'You are a precise OCR and text extraction assistant.';

    const response = await callLLM(model, prompt, systemNote, userId ?? null);

    const text = response?.content?.trim() || '';
    return {
      text,
      method: 'llm_vision',
      confidence: text.length > 100 ? 'high' : 'low',
    };
  } catch (err) {
    console.error('[KB Extractor] LLM Vision fallback failed:', err);
    return {
      text: '',
      method: 'llm_vision',
      confidence: 'low',
      warnings: [`LLM Vision extraction failed: ${(err as Error).message}`],
    };
  }
}
