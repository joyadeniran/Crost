import { transformToEmail } from './email-transformer';
import { transformToMarkdownPlan, transformToMarkdownResearch } from './markdown-transformer';
import { transformToDocument } from './document-transformer';
import { transformToExcel } from './excel-transformer';
import { transformToCode } from './code-transformer';
import { transformToPresentation } from './pptx-transformer';
import { transformToImage } from './image-transformer';

export interface OutputDetection {
  sourceFormat: 'json' | 'text' | 'array';
  contentType: 'email' | 'document' | 'plan' | 'research' | 'code' | 'image' | 'generic';
  targetFormat: 'txt' | 'docx' | 'md' | 'xlsx' | 'json' | 'csv' | 'py' | 'sql' | 'ts' | 'js' | 'jpg';
  transformer?: (data: any) => Promise<string | Buffer>;
}

/**
 * Detect the best output format for a given LLM response.
 *
 * Priority order:
 *   1. Explicit action field hints ("excel", "word", etc.)
 *   2. Nested content_for_excel / content_for_word markers
 *   3. Department identity (FINANCE → xlsx, SALES/MARKETING/OPS → docx)
 *   4. Data structure analysis (table-like → xlsx, narrative → docx)
 *   5. Legacy schema detection
 *   6. Default → md  (never txt for structured JSON)
 */
/**
 * `taskHint` is the founder's raw task / action text. When supplied, strong
 * format cues in the hint (e.g. "excel sheet", "pitch deck", "pdf report")
 * override weaker response-shape heuristics further down — this prevents an
 * LLM that drifted into narrative from silently producing the wrong file type.
 */
export function detectOutputType(content: unknown, isJson: boolean, taskHint?: string): OutputDetection {
  // Normalise the founder-task hint so we can run keyword checks on it.
  const hintLower = (taskHint || '').toLowerCase();
  const hintDemandsXlsx = /\b(excel|xlsx|spreadsheet|workbook|budget|forecast|projection|tracker|p&l|balance sheet|income statement|cash[- ]flow|kpi tracker|financial model|excel sheet|excel template)\b/.test(hintLower);
  const hintDemandsPptx = /\b(pptx|powerpoint|pitch deck|slide deck|slides|keynote)\b/.test(hintLower);
  const hintDemandsPdf = /\b(pdf|pdf report|export pdf)\b/.test(hintLower);
  const hintDemandsDocx = /\b(docx|word document|word doc|memo|brief|letter|one[- ]pager|word report)\b/.test(hintLower);
  const hintDemandsCode = /\b(code|script|sql|css|typescript|javascript|python|develop|implement|logic|feature|refactor|component|schema)\b/.test(hintLower);
  const hintDemandsImage = /\b(image|graphic|banner|logo|illustration|photo|visual|generate image)\b/.test(hintLower);

  if (!isJson) {
    // Founder explicitly asked for a typed artefact but LLM returned narrative —
    // transform the narrative into that type anyway rather than dropping to .txt.
    if (hintDemandsXlsx) return { sourceFormat: 'text', contentType: 'generic', targetFormat: 'xlsx', transformer: transformToExcel };
    if (hintDemandsPptx) return { sourceFormat: 'text', contentType: 'generic', targetFormat: 'docx', transformer: transformToPresentation };
    if (hintDemandsDocx) return { sourceFormat: 'text', contentType: 'document', targetFormat: 'docx', transformer: transformToDocument };
    if (hintDemandsImage) return { sourceFormat: 'text', contentType: 'image', targetFormat: 'jpg', transformer: transformToImage };
    if (hintDemandsCode) return { sourceFormat: 'text', contentType: 'code', targetFormat: 'txt' }; // raw code string
    // Plain text: only use txt for truly unstructured text
    return {
      sourceFormat: 'text',
      contentType: 'generic',
      targetFormat: 'txt',
    };
  }

  // ── Hint override (highest priority among JSON routes) ──────────────────
  // If the founder asked for a specific format, lock it in before any content
  // heuristic — this is what fixes "prompt asked for Excel, got DOCX".
  if (hintDemandsXlsx) {
    return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'xlsx', transformer: transformToExcel };
  }
  if (hintDemandsPptx) {
    return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'docx', transformer: transformToPresentation };
  }
  if (hintDemandsPdf) {
    // No dedicated PDF transformer yet — produce markdown so downstream can convert.
    return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'md', transformer: transformToMarkdownResearch };
  }
  if (hintDemandsDocx) {
    return { sourceFormat: 'json', contentType: 'document', targetFormat: 'docx', transformer: transformToDocument };
  }
  if (hintDemandsCode) {
    // Technical departments producing JSON should often be using the 'code' transformer
    return { sourceFormat: 'json', contentType: 'code', targetFormat: 'txt', transformer: transformToCode };
  }
  if (hintDemandsImage) {
    return { sourceFormat: 'json', contentType: 'image', targetFormat: 'jpg', transformer: transformToImage };
  }

  let parsed: any;
  if (typeof content !== 'string') {
    parsed = content;
  } else {
    const stripped = content.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    try {
      parsed = JSON.parse(stripped);
    } catch {
      return { sourceFormat: 'text', contentType: 'generic', targetFormat: 'md', transformer: transformToMarkdownResearch };
    }
  }

  // ── CHECK 0a: Skill contract (highest priority — LLM followed SKILL.md) ─
  // The xlsx / docx / code skills instruct the LLM to set "skill": "xlsx" | "docx" | "code"
  // at the root of the JSON. Match this before any heuristic check.
  if (parsed?.skill === 'xlsx') {
    return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'xlsx', transformer: transformToExcel };
  }
  if (parsed?.skill === 'docx') {
    return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'docx', transformer: transformToDocument };
  }
  if (parsed?.skill === 'pptx') {
    return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'docx', transformer: transformToPresentation };
  }
  if (parsed?.skill === 'code') {
    // For code, derive extension from file_name if possible
    const ext = parsed.file_name?.split('.').pop() || 'txt';
    return { sourceFormat: 'json', contentType: 'code', targetFormat: ext as any, transformer: transformToCode };
  }

  if (parsed?.skill === 'image') {
    return { sourceFormat: 'json', contentType: 'image', targetFormat: 'md', transformer: transformToMarkdownResearch };
  }

  // ── CHECK 0: Explicit format field set by department prompt ─────────────
  if (parsed?.format && typeof parsed.format === 'string') {
    const fmt = parsed.format.toLowerCase();
    if (fmt === 'xlsx' || fmt === 'excel') {
      return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'xlsx', transformer: transformToExcel };
    }
    if (fmt === 'docx' || fmt === 'word' || fmt === 'document') {
      return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'docx', transformer: transformToDocument };
    }
    if (fmt === 'md' || fmt === 'markdown') {
      return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'md', transformer: transformToMarkdownResearch };
    }
    if (fmt === 'jpg' || fmt === 'png' || fmt === 'image') {
      return { sourceFormat: 'json', contentType: 'image', targetFormat: 'jpg', transformer: transformToImage };
    }
  }

  // ── CHECK 1: Explicit action field ──────────────────────────────────────
  if (parsed?.action && typeof parsed.action === 'string') {
    const action = parsed.action.toLowerCase();
    if (action.includes('excel') || action.includes('spreadsheet') || action.includes('table')) {
      return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'xlsx', transformer: transformToExcel };
    }
    if (action.includes('word') || action.includes('document') || action.includes('report')) {
      return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'docx', transformer: transformToDocument };
    }
    if (action.includes('image') || action.includes('graphic') || action.includes('banner')) {
      return { sourceFormat: 'json', contentType: 'image', targetFormat: 'jpg', transformer: transformToImage };
    }
  }

  // ── CHECK 2: Nested content_for_excel / content_for_word markers ─────────
  const nestedFormat = findContentMarker(parsed);
  if (nestedFormat === 'xlsx') {
    return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'xlsx', transformer: transformToExcel };
  }
  if (nestedFormat === 'docx') {
    return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'docx', transformer: transformToDocument };
  }

  // ── CHECK 3: Department identity ─────────────────────────────────────────
  const dept = typeof parsed.department === 'string' ? parsed.department.toUpperCase() : null;

  if (dept === 'FINANCE') {
    // Finance → Excel (spreadsheets / models / tables)
    return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'xlsx', transformer: transformToExcel };
  }

  if (dept === 'OPERATIONS' && parsed.deliverable_content?.sections) {
    // Ops with sections → Excel (structured sections become sheets)
    return { sourceFormat: 'json', contentType: 'plan', targetFormat: 'xlsx', transformer: transformToExcel };
  }

  if (dept === 'SALES' || dept === 'MARKETING' || dept === 'OPERATIONS') {
    // Sales / Marketing / Ops → Word doc (strategy narrative)
    return { sourceFormat: 'json', contentType: 'document', targetFormat: 'docx', transformer: transformToDocument };
  }

  if (dept === 'ENGINEERING') {
    return { sourceFormat: 'json', contentType: 'document', targetFormat: 'md', transformer: transformToMarkdownResearch };
  }

  // ── CHECK 4: Data structure analysis ─────────────────────────────────────
  if (containsTableLikeData(parsed)) {
    return { sourceFormat: 'array', contentType: 'research', targetFormat: 'xlsx', transformer: transformToExcel };
  }

  if (containsNarrativeLikeData(parsed)) {
    return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'docx', transformer: transformToDocument };
  }

  // ── CHECK 5: Legacy schema detection ─────────────────────────────────────
  if (Array.isArray(parsed) || (parsed?.data && Array.isArray(parsed.data))) {
    return { sourceFormat: 'array', contentType: 'research', targetFormat: 'xlsx', transformer: transformToExcel };
  }

  if (parsed?.refined_email_template || parsed?.email_template || (parsed?.subject && parsed?.body)) {
    return { sourceFormat: 'json', contentType: 'email', targetFormat: 'docx', transformer: transformToDocument };
  }

  if (parsed?.coordinated_outreach_plan || parsed?.project_plan) {
    return { sourceFormat: 'json', contentType: 'plan', targetFormat: 'md', transformer: transformToMarkdownPlan };
  }

  if (parsed?.research_findings || parsed?.key_insights) {
    return { sourceFormat: 'json', contentType: 'research', targetFormat: 'md', transformer: transformToMarkdownResearch };
  }

  // ── Default: Markdown — never raw .txt for JSON ──────────────────────────
  return {
    sourceFormat: 'json',
    contentType: 'generic',
    targetFormat: 'md',
    transformer: transformToMarkdownResearch,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Search nested JSON for content_for_excel / content_for_word markers */
function findContentMarker(obj: any, depth: number = 0): 'xlsx' | 'docx' | null {
  if (depth > 3 || !obj || typeof obj !== 'object') return null;
  if (obj.content_for_excel) return 'xlsx';
  if (obj.content_for_word) return 'docx';
  for (const v of Object.values(obj)) {
    const result = findContentMarker(v, depth + 1);
    if (result) return result;
  }
  return null;
}

/** True if data looks like a table: array of uniform objects, or nested numeric tables */
function containsTableLikeData(obj: any): boolean {
  if (Array.isArray(obj)) {
    return obj.length > 3 && obj.every(item => typeof item === 'object' && item !== null);
  }
  return Object.values(obj).some(v =>
    (Array.isArray(v) && (v as any[]).length > 3 && (v as any[]).every((i: any) => typeof i === 'object')) ||
    (typeof v === 'object' && v !== null && Object.keys(v).length > 5 &&
      Object.values(v).some(val => typeof val === 'number'))
  );
}

/** True if data contains significant narrative text */
function containsNarrativeLikeData(obj: any): boolean {
  const values = flattenValues(obj);
  const longStrings = values.filter(v => typeof v === 'string' && (v as string).length > 50);
  return longStrings.length > 2 && longStrings.join(' ').length > 150;
}

/** Recursively extract all values from nested object */
function flattenValues(obj: any, depth: number = 0): any[] {
  if (depth > 4 || obj === null || obj === undefined) return [];
  const values: any[] = [];
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      values.push(v);
      if (typeof v === 'object') values.push(...flattenValues(v, depth + 1));
    }
  }
  return values;
}
