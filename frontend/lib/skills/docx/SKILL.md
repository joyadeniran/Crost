# SKILL: docx — Word Document

## Purpose
Produce a well-structured Word document as a JSON document manifest.
Your output will be converted to a real `.docx` file by Crost's artifact transformer.
Do not produce raw XML, binary data, or markdown — output valid JSON only.

## When this skill applies
- Task action contains: `create_document`, `create_doc`, `write_report`, `draft_document`, `write_brief`, `create_memo`
- Task params include `output_format: "docx"` or `output_format: "document"`
- The task label references a document, report, brief, proposal, or memo

## JSON output contract

Your entire response MUST be the following JSON structure — no prose before or after:

```json
{
  "skill": "docx",
  "title": "<Document title>",
  "subtitle": "<Optional subtitle>",
  "author": "<Department name, e.g. Marketing>",
  "date": "<ISO date, e.g. 2026-04-23>",
  "include_toc": true,
  "sections": [
    {
      "heading": "<Section heading>",
      "level": 1,
      "content": "<Full paragraph text for this section. Can be multiple sentences.>",
      "subsections": [
        {
          "heading": "<Sub-heading>",
          "level": 2,
          "content": "<Paragraph text>"
        }
      ]
    }
  ],
  "footnotes": [
    {
      "ref": "<[1]>",
      "text": "<Citation text, e.g. Company Memo: Q1 Strategy — Apr 2026>"
    }
  ],
  "sources": {
    "memo_ids": [],
    "kb_file_ids": [],
    "tool_calls": []
  }
}
```

## Section level rules

| Level | Use for |
|-------|---------|
| `1` | Top-level section (Executive Summary, Introduction, Recommendations, etc.) |
| `2` | Sub-section within a top-level section |
| `3` | Rarely used — very detailed breakdowns only |

## Structure rules

1. **Always include** an **Executive Summary** as the first level-1 section (3–5 sentences).
2. **Always include** a **Recommendations** or **Next Steps** section near the end.
3. **Always include** a **References** section as the final section, listing all sources.
4. **Table of Contents**: set `include_toc: true` for documents with 4+ sections.
5. **Section content**: write in clear, professional prose. Avoid bullet lists inside content — this is a document, not a slide deck.
6. **Heading casing**: Title Case for level-1 headings; Sentence case for level-2.
7. **Footnote refs**: inline refs appear in content as `[1]`, `[2]`, etc. matching the footnotes array.
8. **Minimum sections**: 3 (Executive Summary + body + References).
9. **Maximum sections**: 12. If you have more material, aggregate into broader sections.

## Anti-patterns — never do these

- ❌ Empty section content (always provide real, substantive text)
- ❌ Bullet-list-only sections without any prose
- ❌ Omitting the Executive Summary
- ❌ Omitting the References / Sources section
- ❌ Making `include_toc: true` for short documents with only 2 sections
- ❌ Level-3 headings without a level-2 parent
- ❌ Repetitive content that copies the task description verbatim instead of synthesizing
- ❌ Setting `date` to `null` — use today's ISO date if uncertain

## Citation instruction

When you use information from company memos, KB files, or tool results:
1. Add an inline ref `[N]` at the point of use in the content string.
2. Add a matching entry to the `footnotes` array.
3. Add the source ID/reference to the `sources` object.
4. The final **References** section should list all sources in plain language as section content.

Format:
- Memo: `"Company Memo: <title> — <department>, <date if known>"`
- KB file: `"Knowledge Base file: <title> (<file type>)"`
- Tool call: `"External data via <service>.<action>: <brief description>"`
