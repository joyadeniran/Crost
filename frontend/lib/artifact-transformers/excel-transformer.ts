import * as xlsx from 'xlsx';

/**
 * Universal Excel transformer.
 * Handles all department JSON schemas:
 *   - FINANCE:    analysis.summary + financial_framework / kpis / recommendations
 *   - OPERATIONS: deliverable_content.summary + sections (each section → own sheet)
 *   - SALES:      output.summary + objectives / strategies / metrics
 *   - MARKETING:  strategy.summary + budget_allocation / success_metrics
 *   - Arrays of objects → direct spreadsheet
 *   - Fallback:   Any JSON — flattened into key/value rows
 */
export async function transformToExcel(data: any): Promise<Buffer> {
  const workbook = xlsx.utils.book_new();

  // ─── FINANCE schema ──────────────────────────────────────────────────────
  if (data?.analysis && data?.department === 'FINANCE') {
    const ana = data.analysis;

    // Summary sheet
    addSummarySheet(workbook, ana.summary, data.department);

    // Financial framework
    if (ana.financial_framework) {
      addObjectSheet(workbook, ana.financial_framework, 'Framework');
    }

    // Key assumptions
    if (ana.key_assumptions) {
      addListSheet(workbook, ana.key_assumptions, 'Key Assumptions', 'Assumption');
    }

    // Recommendations
    if (ana.recommendations) {
      addListSheet(workbook, ana.recommendations, 'Recommendations', 'Recommendation');
    }

    // KPIs
    if (ana.kpis) {
      addObjectSheet(workbook, ana.kpis, 'KPIs');
    }

    return xlsxBuffer(workbook);
  }

  // ─── OPERATIONS schema ───────────────────────────────────────────────────
  if (data?.deliverable_content) {
    const dc = data.deliverable_content;
    addSummarySheet(workbook, dc.summary, data.department || 'OPERATIONS');

    if (dc.sections && typeof dc.sections === 'object') {
      for (const [sectionKey, sectionVal] of Object.entries(dc.sections)) {
        const sheetName = sectionKey.substring(0, 31).replace(/[^\w\s]/g, '');
        addValueSheet(workbook, sectionVal, sheetName || sectionKey.substring(0, 31));
      }
    }

    return xlsxBuffer(workbook);
  }

  // ─── SALES schema ─────────────────────────────────────────────────────────
  if (data?.output && data?.department === 'SALES') {
    const out = data.output;
    addSummarySheet(workbook, out.summary, 'SALES');

    if (out.objectives) addListSheet(workbook, out.objectives, 'Objectives', 'Objective');
    if (out.strategies) addListSheet(workbook, out.strategies, 'Strategies', 'Strategy');
    if (out.metrics) addObjectSheet(workbook, out.metrics, 'Metrics');
    if (out.timeline) {
      addListSheet(workbook, [String(out.timeline)], 'Timeline', 'Timeline');
    }

    return xlsxBuffer(workbook);
  }

  // ─── MARKETING schema ────────────────────────────────────────────────────
  if (data?.strategy && data?.department === 'MARKETING') {
    const strat = data.strategy;
    addSummarySheet(workbook, strat.summary, 'MARKETING');

    if (strat.key_messages) addListSheet(workbook, strat.key_messages, 'Key Messages', 'Message');
    if (strat.channels) addListSheet(workbook, strat.channels, 'Channels', 'Channel');
    if (strat.target_audience) addObjectSheet(workbook, strat.target_audience, 'Target Audience');
    if (strat.budget_allocation) addObjectSheet(workbook, strat.budget_allocation, 'Budget Allocation');
    if (strat.success_metrics) addObjectSheet(workbook, strat.success_metrics, 'Success Metrics');

    return xlsxBuffer(workbook);
  }

  // ─── Legacy: explicit content_for_excel ──────────────────────────────────
  if (data?.deliverable_content?.content_for_excel) {
    const content = data.deliverable_content.content_for_excel;
    for (const [sectionName, sectionData] of Object.entries(content)) {
      let sheetData: any[];
      if (typeof sectionData === 'string') {
        sheetData = [{ [sectionName]: sectionData }];
      } else if (Array.isArray(sectionData)) {
        sheetData = sectionData as any[];
      } else if (typeof sectionData === 'object' && sectionData !== null) {
        sheetData = flattenObject(sectionData);
      } else {
        sheetData = [{ value: String(sectionData) }];
      }
      const sanitized = sectionName.substring(0, 31).replace(/[^\w\s]/g, '');
      appendSheet(workbook, sheetData, sanitized || 'Sheet');
    }
    return xlsxBuffer(workbook);
  }

  // ─── Array of objects ────────────────────────────────────────────────────
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
    appendSheet(workbook, data, 'Data');
    return xlsxBuffer(workbook);
  }

  const innerArray = data?.data && Array.isArray(data.data) ? data.data
    : data?.research_findings && Array.isArray(data.research_findings) ? data.research_findings
    : null;
  if (innerArray) {
    appendSheet(workbook, innerArray, 'Data');
    return xlsxBuffer(workbook);
  }

  // ─── Generic fallback: flatten entire JSON into key/value rows ───────────
  const rows = flattenToRows(data);
  appendSheet(workbook, rows.length > 0 ? rows : [{ key: 'output', value: JSON.stringify(data) }], 'Output');
  return xlsxBuffer(workbook);
}

// ─── Sheet helpers ────────────────────────────────────────────────────────────

/** Summary overview sheet */
function addSummarySheet(wb: xlsx.WorkBook, summary: string | undefined, dept: string) {
  const rows: any[] = [
    { Field: 'Department', Value: dept },
    { Field: 'Summary', Value: summary || 'No summary provided' },
    { Field: 'Generated', Value: new Date().toISOString() },
  ];
  appendSheet(wb, rows, 'Summary');
}

/** Object → two-column key/value sheet */
function addObjectSheet(wb: xlsx.WorkBook, obj: any, name: string) {
  if (!obj || typeof obj !== 'object') return;
  const rows = Object.entries(obj).map(([k, v]) => ({
    Key: k.replace(/_/g, ' '),
    Value: typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''),
  }));
  if (rows.length > 0) appendSheet(wb, rows, name.substring(0, 31));
}

/** Array of strings → single-column sheet */
function addListSheet(wb: xlsx.WorkBook, list: any, name: string, colLabel: string) {
  if (!list) return;
  const arr = Array.isArray(list) ? list : [list];
  const rows = arr.map((item: any) => ({
    [colLabel]: typeof item === 'object' ? JSON.stringify(item) : String(item),
  }));
  if (rows.length > 0) appendSheet(wb, rows, name.substring(0, 31));
}

/** Any value — auto-detect array vs object vs primitive */
function addValueSheet(wb: xlsx.WorkBook, val: any, name: string) {
  if (!val) return;
  if (Array.isArray(val)) {
    const rows = val.map((item: any, i: number) => ({
      Index: i + 1,
      Value: typeof item === 'object' ? JSON.stringify(item) : String(item),
    }));
    appendSheet(wb, rows, name);
  } else if (typeof val === 'object') {
    addObjectSheet(wb, val, name);
  } else {
    appendSheet(wb, [{ Value: String(val) }], name);
  }
}

function appendSheet(wb: xlsx.WorkBook, data: any[], name: string) {
  const safeData = data.length > 0 ? data : [{ value: 'No data' }];
  const ws = xlsx.utils.json_to_sheet(safeData);
  xlsx.utils.book_append_sheet(wb, ws, name.substring(0, 31) || 'Sheet');
}

function xlsxBuffer(wb: xlsx.WorkBook): Buffer {
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ─── Flatten helpers ──────────────────────────────────────────────────────────

function flattenObject(obj: any, prefix = ''): any[] {
  const result: any[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(val)) {
      result.push(...(val as any[]).map((item: any) => ({ [fullKey]: typeof item === 'object' ? JSON.stringify(item) : item })));
    } else if (typeof val === 'object' && val !== null) {
      result.push(...flattenObject(val, fullKey));
    } else {
      result.push({ [fullKey]: val });
    }
  }
  return result;
}

function flattenToRows(obj: any, prefix = ''): { key: string; value: string }[] {
  const result: { key: string; value: string }[] = [];
  if (typeof obj !== 'object' || obj === null) {
    return [{ key: prefix || 'value', value: String(obj) }];
  }
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      result.push(...flattenToRows(v, fullKey));
    } else {
      result.push({ key: fullKey, value: Array.isArray(v) ? JSON.stringify(v) : String(v ?? '') });
    }
  }
  return result;
}
