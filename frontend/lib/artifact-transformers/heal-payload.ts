/**
 * LLMs sometimes emit nested arrays/objects as *stringified* JSON inside an
 * otherwise-valid outer JSON object. This breaks downstream transformers that
 * rely on `Array.isArray(data.sheets)` etc. and causes them to fall through to
 * a generic key/value flatten.
 *
 * `healSkillPayload` walks the payload and, for any string field whose value
 * looks like a JSON array or object (`[...]` / `{...}`), re-parses it. Runs
 * iteratively up to a small depth cap to handle double-stringified values.
 *
 * Safe for all SKILL.md contracts (xlsx/docx) — only re-parses strings that
 * clearly look like JSON containers.
 */
export function healSkillPayload<T = any>(input: T, depth = 0): T {
  if (depth > 4 || input === null || input === undefined) return input;

  // Try to coerce a string that looks like JSON into its parsed form.
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return healSkillPayload(parsed, depth + 1) as T;
      } catch {
        return input;
      }
    }
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(v => healSkillPayload(v, depth + 1)) as unknown as T;
  }

  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = healSkillPayload(v, depth + 1);
    }
    return out as T;
  }

  return input;
}
