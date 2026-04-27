# SKILL: code — Source Code & Technical Implementation

## Purpose
Produce high-quality source code, scripts, or configuration files as a JSON manifest.
Your output will be converted to a downloadable source file by Crost's artifact transformer.

## When this skill applies
- Task action contains: `write_code`, `develop_feature`, `refactor_code`, `create_script`, `configure_service`, `implement_logic`
- Department is `engineering`
- The task label references code, scripts, SQL, CSS, or implementation

## JSON output contract

Your entire response MUST be the following JSON structure — no prose before or after:

```json
{
  "skill": "code",
  "file_name": "<name_of_file.ext, e.g. main.py, schema.sql, Component.tsx>",
  "language": "<programming_language, e.g. python, sql, typescript, css>",
  "description": "<short description of what this code does>",
  "code": "<The raw source code content>",
  "documentation": "<Optional markdown documentation explaining how to use or run the code>",
  "sources": {
    "memo_ids": [],
    "kb_file_ids": [],
    "tool_calls": []
  }
}
```

## Implementation rules

1. **Self-Contained**: The code should be as self-contained as possible.
2. **Best Practices**: Follow industry-standard style guides for the target language.
3. **Comments**: Include helpful comments within the code, but do not narrate the code in the JSON fields.
4. **Markdown**: The `documentation` field should be used for implementation notes, not the `code` field.
5. **No Placeholders**: Never use `// your code here` or `...rest of code`. Provide the full implementation.

## Citation instruction

If your implementation relies on specific company memos or KB files:
1. Add the source ID/reference to the `sources` object.
2. Mention the source in the `documentation` field.
