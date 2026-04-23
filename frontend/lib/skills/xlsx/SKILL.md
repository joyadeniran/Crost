# SKILL: xlsx — Excel Spreadsheet

## Purpose
Produce a well-structured spreadsheet as a JSON workbook manifest.
Your output will be converted to a real `.xlsx` file by Crost's artifact transformer.
Do not produce CSV, raw Python, or markdown tables — output valid JSON only.

## When this skill applies
- Task action contains: `create_spreadsheet`, `create_model`, `build_tracker`, `generate_forecast`, `create_budget`, `build_pipeline`
- Task params include `output_format: "xlsx"` or `output_format: "spreadsheet"`
- The task label references a model, tracker, forecast, budget, pipeline, or data table

## JSON output contract

Your entire response MUST be the following JSON structure — no prose before or after:

```json
{
  "skill": "xlsx",
  "title": "<Workbook title>",
  "author": "<Department name>",
  "sheets": [
    {
      "name": "<Sheet tab name, max 31 chars>",
      "description": "<One sentence purpose of this sheet>",
      "freeze_header_row": true,
      "columns": [
        { "key": "col_a", "header": "<Column header>", "type": "text", "width": 20 },
        { "key": "col_b", "header": "<Column header>", "type": "number", "width": 12, "format": "#,##0.00" },
        { "key": "col_c", "header": "<Column header>", "type": "formula", "width": 15, "format": "#,##0" }
      ],
      "rows": [
        { "col_a": "Row 1 value", "col_b": 1000, "col_c": "=B2*0.1" },
        { "col_a": "Row 2 value", "col_b": 2500, "col_c": "=B3*0.1" }
      ],
      "totals_row": true
    }
  ],
  "sources": {
    "memo_ids": [],
    "kb_file_ids": [],
    "tool_calls": []
  }
}
```

## Column type reference

| Type | When to use | Notes |
|------|-------------|-------|
| `text` | Labels, names, categories | Left-aligned by default |
| `number` | Quantities, amounts | Right-aligned; use `format` for currency/percentage |
| `formula` | Calculated cells | Value must be a valid Excel formula string starting with `=` |
| `date` | Date fields | Use `format: "DD/MM/YYYY"` or `"YYYY-MM-DD"` |
| `percent` | Percentages | Store as decimal (0.15 = 15%); use `format: "0.00%"` |
| `currency` | Money amounts | Use `format: "\"$\"#,##0.00"` or local currency symbol |

## Format string reference (Excel notation)

- Thousands separator: `"#,##0"`
- Two decimal places: `"0.00"`
- Currency (USD): `"\"$\"#,##0.00"`
- Percentage: `"0.00%"`
- Date: `"DD/MM/YYYY"`

## Structure rules

1. **Sheet names**: max 31 characters, no special characters (`/ \ ? * : [ ]`).
2. **Always include** a **Summary** sheet as the first sheet for multi-sheet workbooks.
3. **Freeze header rows** (`freeze_header_row: true`) on all data sheets.
4. **Totals row** (`totals_row: true`) on all numeric data sheets — the transformer will add SUM formulas for numeric columns automatically.
5. **Formulas**: reference cells using column letter notation (`=B2*C2`). Row numbers in the JSON rows array correspond to Excel row numbers starting at row 2 (row 1 is the header).
6. **Column width**: `width` is in characters. Default 12 for numbers, 20 for text, 15 for formulas.
7. **Max sheets**: 6. Use a Summary sheet if you have more than 3 data sheets.
8. **Max columns**: 15 per sheet. Break into multiple sheets if you need more.

## Anti-patterns — never do these

- ❌ Hardcoding totals as static numbers instead of using `=SUM(...)` formulas
- ❌ Sheet names with spaces or special characters
- ❌ Missing header row (columns array must always be present)
- ❌ Rows with keys that don't match the columns array
- ❌ Producing CSV-only content — always produce the full JSON workbook manifest
- ❌ Empty rows[] arrays — always populate with realistic example data relevant to the founder's context
- ❌ Formula values that are not valid Excel formula strings (must start with `=`)

## Citation instruction

When data comes from company memos, KB files, or tool results:
1. Add a **Sources** sheet as the last sheet with two columns: `Source` (text) and `Reference` (text).
2. List each source as a row in the Sources sheet.
3. Populate the `sources` object at the root.

Format:
- Memo: `"Company Memo: <title>"`
- KB file: `"Knowledge Base: <file title>"`
- Tool call: `"<service>.<action>: <what was retrieved>"`
