import { transformToEmail } from './email-transformer';
import { transformToMarkdownPlan, transformToMarkdownResearch } from './markdown-transformer';
import { transformToDocument } from './document-transformer';
import { transformToExcel } from './excel-transformer';

export interface OutputDetection {
  sourceFormat: 'json' | 'text' | 'array';
  contentType: 'email' | 'document' | 'plan' | 'research' | 'generic';
  targetFormat: 'txt' | 'docx' | 'md' | 'xlsx' | 'json' | 'csv';
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
export function detectOutputType(content: string, isJson: boolean): OutputDetection {
  if (!isJson) {
    // Plain text: only use txt for truly unstructured text
    return {
      sourceFormat: 'text',
      contentType: 'generic',
      targetFormat: 'txt',
    };
  }

  // Strip markdown fences that LLMs often wrap JSON in
  const stripped = content.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // Couldn't parse despite isJson flag — safe fallback
    return { sourceFormat: 'text', contentType: 'generic', targetFormat: 'md', transformer: transformToMarkdownResearch };
  }

  // ── CHECK 0a: Skill contract (highest priority — LLM followed SKILL.md) ─
  // The xlsx / docx skills instruct the LLM to set "skill": "xlsx" | "docx"
  // at the root of the JSON. Match this before any heuristic check.
  if (parsed?.skill === 'xlsx') {
    return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'xlsx', transformer: transformToExcel };
  }
  if (parsed?.skill === 'docx') {
    return { sourceFormat: 'json', contentType: 'generic', targetFormat: 'docx', transformer: transformToDocument };
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
  return longStrings.length > 2 && longStrings.join(' ').length > 500;
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
