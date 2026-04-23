# SKILL: pdf — PDF Generation & Extraction

## Purpose
This skill covers two distinct workflows:
1. **Generation**: Produce a structured PDF as a JSON page manifest. Crost's artifact transformer converts it to a real `.pdf` file.
2. **Extraction**: When a PDF from the Knowledge Base is provided as context, extract and synthesize its content faithfully.

Do not produce raw PostScript, LaTeX, or binary data — output valid JSON only.

## When this skill applies
- Task action contains: `create_pdf`, `generate_pdf`, `export_pdf`, `extract_pdf`, `summarize_pdf`
- Task params include `output_format: "pdf"`
- The task expected deliverable references a PDF report, brief, or export

## JSON output contract — GENERATION

Your entire response MUST be the following JSON structure when generating a PDF:

```json
{
  "skill": "pdf",
  "mode": "generate",
  "title": "<Document title>",
  "subtitle": "<Optional subtitle>",
  "author": "<Department name>",
  "date": "<ISO date>",
  "pages": [
    {
      "page_number": 1,
      "layout": "cover",
      "title": "<Title>",
      "subtitle": "<Subtitle>",
      "date": "<Formatted date for cover>"
    },
    {
      "page_number": 2,
      "layout": "toc",
      "entries": [
        { "title": "<Section title>", "page": 3 }
      ]
    },
    {
      "page_number": 3,
      "layout": "section",
      "heading": "<Section heading>",
      "level": 1,
      "content": "<Full prose content of this section.>"
    },
    {
      "page_number": 99,
      "layout": "references",
      "heading": "References",
      "entries": [
        "<[1] Reference text>",
        "<[2] Reference text>"
      ]
    }
  ],
  "sources": {
    "memo_ids": [],
    "kb_file_ids": [],
    "tool_calls": []
  }
}
```

## JSON output contract — EXTRACTION

When the task is to extract or summarize a PDF from the Knowledge Base:

```json
{
  "skill": "pdf",
  "mode": "extract",
  "source_file": "<file title from KB>",
  "summary": "<3–5 sentence executive summary of what the PDF contains>",
  "key_sections": [
    {
      "heading": "<Section title found in the PDF>",
      "content": "<Faithful summary of that section — do not hallucinate content>"
    }
  ],
  "key_figures": [
    { "label": "<Label>", "value": "<Extracted value with units>" }
  ],
  "limitations": "<Note any pages that were unclear, truncated, or image-only and could not be extracted>",
  "sources": {
    "memo_ids": [],
    "kb_file_ids": ["<id of the KB file being extracted>"],
    "tool_calls": []
  }
}
```

## Page layout types (generation mode)

| Layout | When to use |
|--------|-------------|
| `cover` | First page — title, subtitle, author, date |
| `toc` | Table of contents — include for 5+ section documents |
| `section` | Standard prose content section |
| `figure` | Chart or image placeholder — add `"figure_description": "<desc>"` |
| `references` | MANDATORY final page — lists all citations |

## Structure rules (generation mode)

1. **Always include** a `cover` page as the first page.
2. **Always include** a `references` page as the last page.
3. **Include `toc`** for documents with 5 or more section pages.
4. **Section content**: write complete prose paragraphs, not bullet lists (PDFs are read documents, not slide decks).
5. **Page numbers**: assign sequentially starting from 1.
6. **Citations**: inline refs `[1]`, `[2]` in content, matched in the references page entries.
7. **Page count**: 4–20 pages for a standard PDF report. Never fewer than 3.

## Anti-patterns — never do these

- ❌ Hallucinating content during extraction — only report what the KB file actually contains
- ❌ Missing the `references` / `cover` page
- ❌ Bullet-only pages — use prose in section layouts
- ❌ Mixing `generate` and `extract` modes in one response
- ❌ Leaving `sources.kb_file_ids` empty in extraction mode — always record the source file ID
- ❌ Page numbers that are non-sequential or start at 0

## Citation instruction

**Generation mode**: inline `[N]` refs in section content, entries in the `references` page, and IDs in the `sources` object.

**Extraction mode**: the KB file being extracted is always the primary source — record its ID in `sources.kb_file_ids`. Add any supporting memos or tool calls to the other source arrays.
