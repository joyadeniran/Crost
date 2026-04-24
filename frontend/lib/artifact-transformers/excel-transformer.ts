import * as xlsx from 'xlsx';

/**
 * Universal Excel transformer.
 * Handles all department JSON schemas:
 *   - SKILL.md:   { skill: "xlsx", sheets: [...] } — canonical skill output
 *   - FINANCE:    analysis.summary + financial_framework / kpis / recommendations
 *   - OPERATIONS: deliverable_content.summary + sections (each section → own sheet)
 *   - SALES:      output.summary + objectives / strategies / metrics
 *   - MARKETING:  strategy.summary + budget_allocation / success_metrics
 *   - Arrays of objects → direct spreadsheet
 *   - Fallback:   Any JSON — flattened into key/value rows
 */
export async function transformToExcel(data: any): Promise<Buffer> {
  const workbook = xlsx.utils.book_new();

  // ─── SKILL.md schema: { skill: "xlsx", sheets: [...] } ──────────────────
  // This is the canonical output when the LLM followed the xlsx SKILL.md contract.
  // Highest priority — checked before all department-specific heuristics.
  if (data?.skill === 'xlsx' && Array.isArray(data?.sheets)) {
    return transformSkillSchema(data);
  }

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

// ─── Skill schema transformer ─────────────────────────────────────────────────

interface SkillColumn {
  key: string;
  header: string;
  type: string;
  width: number;
  format?: string;
}

/**
 * Transforms the canonical SKILL.md xlsx JSON contract into a proper workbook.
 * Handles both column formats:
 *   - Object columns: { key, header, type, width, format }
 *   - String columns: "Column Name" (key = header = the string)
 * Handles both row formats:
 *   - Object rows: { col_key: value, ... }
 *   - Array rows:  [val1, val2, ...] (mapped by column index)
 */
function transformSkillSchema(data: any): Buffer {
  const workbook = xlsx.utils.book_new();
  const sheets: any[] = Array.isArray(data.sheets) ? data.sheets : [];

  for (const sheetDef of sheets) {
    const rawCols: any[] = Array.isArray(sheetDef.columns) ? sheetDef.columns : [];
    if (rawCols.length === 0) continue;

    // Normalise columns to a uniform shape
    const cols: SkillColumn[] = rawCols.map((c: any) => {
      if (typeof c === 'string') {
        return { key: c, header: c, type: 'text', width: 20 };
      }
      const type = (c.type || 'text') as string;
      const defaultWidth = type === 'text' ? 20 : type === 'formula' ? 15 : 12;
      return {
        key: c.key || c.header || String(c),
        header: c.header || c.key || String(c),
        type,
        width: c.width || defaultWidth,
        format: c.format,
      };
    });

    // Resolve default number formats for types that have no explicit format
    const colsWithFormats = cols.map(col => {
      if (col.format) return col;
      let format: string | undefined;
      if (col.type === 'currency') format = '"$"#,##0.00';
      else if (col.type === 'percent') format = '0.00%';
      else if (col.type === 'number') format = '#,##0';
      else if (col.type === 'date') format = 'DD/MM/YYYY';
      return { ...col, format };
    });

    // Build array-of-arrays: header row first, then data rows
    const rows: any[] = Array.isArray(sheetDef.rows) ? sheetDef.rows : [];
    const aoa: any[][] = [colsWithFormats.map(c => c.header)];

    for (const row of rows) {
      if (Array.isArray(row)) {
        aoa.push(colsWithFormats.map((_c, i) => row[i] ?? ''));
      } else if (typeof row === 'object' && row !== null) {
        aoa.push(colsWithFormats.map(c => row[c.key] ?? row[c.header] ?? ''));
      }
    }

    const ws = xlsx.utils.aoa_to_sheet(aoa);

    // Convert formula strings (starting with '=') to proper formula cells
    for (let r = 1; r < aoa.length; r++) {
      for (let c = 0; c < colsWithFormats.length; c++) {
        const addr = xlsx.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && typeof cell.v === 'string' && (cell.v as string).startsWith('=')) {
          ws[addr] = { t: 'n', f: (cell.v as string).slice(1), v: 0 };
        }
      }
    }

    // Totals row: SUM formula for every numeric/currency/percent column
    if (sheetDef.totals_row && rows.length > 0) {
      const totalsRowIdx = aoa.length;
      const totalsAoa: any[] = colsWithFormats.map((col, ci) => {
        const isNumeric = col.type === 'number' || col.type === 'currency' || col.type === 'percent';
        if (isNumeric) {
          const excelCol = xlsx.utils.encode_col(ci);
          const startRow = 2;
          const endRow = rows.length + 1;
          return endRow >= startRow ? `=SUM(${excelCol}${startRow}:${excelCol}${endRow})` : '';
        }
        return ci === 0 ? 'TOTAL' : '';
      });

      xlsx.utils.sheet_add_aoa(ws, [totalsAoa], { origin: { r: totalsRowIdx, c: 0 } });

      // Convert SUM formula strings in the totals row to proper formula cells
      for (let ci = 0; ci < colsWithFormats.length; ci++) {
        const addr = xlsx.utils.encode_cell({ r: totalsRowIdx, c: ci });
        const cell = ws[addr];
        if (cell && typeof cell.v === 'string' && (cell.v as string).startsWith('=')) {
          ws[addr] = { t: 'n', f: (cell.v as string).slice(1), v: 0 };
        }
      }
    }

    // Column widths
    ws['!cols'] = colsWithFormats.map(c => ({ wch: c.width }));

    // Number formats — apply to all data cells in typed columns
    const totalDataRows = aoa.length - 1; // excludes header
    for (let r = 1; r <= totalDataRows; r++) {
      for (let ci = 0; ci < colsWithFormats.length; ci++) {
        const col = colsWithFormats[ci];
        if (!col.format) continue;
        const addr = xlsx.utils.encode_cell({ r, c: ci });
        if (ws[addr]) ws[addr].z = col.format;
      }
    }

    // Freeze header row
    if (sheetDef.freeze_header_row) {
      ws['!sheetViews'] = [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2' }];
    }

    const sheetName = (sheetDef.name || 'Sheet')
      .substring(0, 31)
      .replace(/[/\\?*:[\]]/g, '_');

    xlsx.utils.book_append_sheet(workbook, ws, sheetName || 'Sheet');
  }

  if (workbook.SheetNames.length === 0) {
    appendSheet(workbook, [{ Title: data.title || 'Untitled', Author: data.author || '' }], 'Info');
  }

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
