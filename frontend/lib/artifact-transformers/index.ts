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

export function detectOutputType(content: string, isJson: boolean): OutputDetection {
  if (!isJson) {
    return {
      sourceFormat: 'text',
      contentType: 'generic',
      targetFormat: 'txt'
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { sourceFormat: 'text', contentType: 'generic', targetFormat: 'txt' };
  }

  // LAYER 3 - SMART FORMAT DETECTION

  // CHECK 1: Explicit format requests in action field
  if (parsed && parsed.action && typeof parsed.action === 'string') {
    const action = parsed.action.toLowerCase();
    if (action.includes('excel') || action.includes('spreadsheet') || action.includes('table')) {
      return {
        sourceFormat: 'json',
        contentType: 'generic',
        targetFormat: 'xlsx',
        transformer: transformToExcel
      };
    }
    if (action.includes('word') || action.includes('document') || action.includes('report')) {
      return {
        sourceFormat: 'json',
        contentType: 'generic',
        targetFormat: 'docx',
        transformer: transformToDocument
      };
    }
  }

  // CHECK 2: Nested content_for_excel or content_for_word
  const findContentFor = (obj: any): string | null => {
    if (obj?.content_for_excel) return 'xlsx';
    if (obj?.content_for_word) return 'docx';
    if (typeof obj === 'object' && obj !== null) {
      for (const v of Object.values(obj)) {
        const result = findContentFor(v);
        if (result) return result;
      }
    }
    return null;
  };

  const contentForFormat = findContentFor(parsed);
  if (contentForFormat === 'xlsx') {
    return {
      sourceFormat: 'json',
      contentType: 'generic',
      targetFormat: 'xlsx',
      transformer: transformToExcel
    };
  }
  if (contentForFormat === 'docx') {
    return {
      sourceFormat: 'json',
      contentType: 'generic',
      targetFormat: 'docx',
      transformer: transformToDocument
    };
  }

  // CHECK 3: Department-specific defaults
  if (parsed.department === 'FINANCE' || (parsed.analysis && parsed.department === 'FINANCE')) {
    return {
      sourceFormat: 'json',
      contentType: 'generic',
      targetFormat: 'xlsx',
      transformer: transformToExcel
    };
  }

  if (parsed.department === 'SALES' && hasNarrativeContent(parsed)) {
    return {
      sourceFormat: 'json',
      contentType: 'generic',
      targetFormat: 'docx',
      transformer: transformToDocument
    };
  }

  if (parsed.department === 'OPERATIONS' && parsed.deliverable_content?.sections) {
    return {
      sourceFormat: 'json',
      contentType: 'plan',
      targetFormat: 'xlsx',
      transformer: transformToExcel
    };
  }

  // CHECK 4: Data structure hints
  if (containsTableLikeData(parsed)) {
    return {
      sourceFormat: 'array',
      contentType: 'research',
      targetFormat: 'xlsx',
      transformer: transformToExcel
    };
  }

  if (containsNarrativeLikeData(parsed)) {
    return {
      sourceFormat: 'json',
      contentType: 'generic',
      targetFormat: 'docx',
      transformer: transformToDocument
    };
  }

  // LEGACY DETECTION (for backwards compatibility)

  if (Array.isArray(parsed) || (parsed && 'data' in parsed && Array.isArray(parsed.data))) {
    return {
      sourceFormat: 'array',
      contentType: 'research',
      targetFormat: 'xlsx',
      transformer: transformToExcel
    };
  }

  if (parsed && ('refined_email_template' in parsed || 'email_template' in parsed || ('subject' in parsed && 'body' in parsed))) {
    return {
      sourceFormat: 'json',
      contentType: 'email',
      targetFormat: 'docx',
      transformer: transformToDocument
    };
  }

  if (parsed && ('coordinated_outreach_plan' in parsed || 'project_plan' in parsed)) {
    return {
      sourceFormat: 'json',
      contentType: 'plan',
      targetFormat: 'md',
      transformer: transformToMarkdownPlan
    };
  }

  if (parsed && ('research_findings' in parsed || 'key_insights' in parsed)) {
    return {
      sourceFormat: 'json',
      contentType: 'research',
      targetFormat: 'md',
      transformer: transformToMarkdownResearch
    };
  }

  // Default: Markdown (safest for unstructured content)
  return {
    sourceFormat: 'json',
    contentType: 'generic',
    targetFormat: 'md',
    transformer: transformToMarkdownResearch
  };
}

/** Check if data structure contains table-like patterns */
function containsTableLikeData(obj: any): boolean {
  if (Array.isArray(obj)) {
    return obj.length > 3 && obj.every(item => typeof item === 'object');
  }

  const values = Object.values(obj);
  return values.some(v =>
    Array.isArray(v) && v.length > 3 ||
    (typeof v === 'object' && v !== null && Object.keys(v).length > 5 && Object.values(v).some(val => typeof val === 'number'))
  );
}

/** Check if data contains narrative/lengthy text content */
function containsNarrativeLikeData(obj: any): boolean {
  const values = flattenValues(obj);
  const longStrings = values.filter(v => typeof v === 'string' && v.length > 50);
  return longStrings.length > 2 && longStrings.join(' ').length > 500;
}

/** Recursively flatten all values from nested objects */
function flattenValues(obj: any, depth: number = 0): any[] {
  if (depth > 3) return [];
  const values: any[] = [];
  if (typeof obj === 'object' && obj !== null) {
    for (const v of Object.values(obj)) {
      values.push(v);
      if (typeof v === 'object') {
        values.push(...flattenValues(v, depth + 1));
      }
    }
  }
  return values;
}

/** Check if JSON contains narrative-like text */
function hasNarrativeContent(obj: any): boolean {
  const values = flattenValues(obj);
  const totalLength = values.filter(v => typeof v === 'string').join(' ').length;
  return totalLength > 500;
}
