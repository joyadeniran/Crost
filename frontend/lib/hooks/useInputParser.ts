// Parses @ and / prefixes from Orc chat input.
//
// @slug [message]         → route directly to that department
// /service.action [text]  → invoke that tool from the gateway
// anything else           → standard Orc goal / dialogue flow

export type ParsedInput =
  | { type: 'orc'; message: string }
  | { type: 'department'; slug: string; message: string }
  | { type: 'tool'; service: string; action: string; params: string }

export function parseInput(raw: string): ParsedInput {
  const trimmed = raw.trim()

  // @slug [message]
  const deptMatch = trimmed.match(/^@([a-zA-Z][a-zA-Z0-9_-]*)(?:\s+([\s\S]*))?$/)
  if (deptMatch) {
    return {
      type: 'department',
      slug: deptMatch[1].toLowerCase(),
      message: deptMatch[2]?.trim() || trimmed,
    }
  }

  // /service.action [params]  OR  /internal_tool [params]
  const toolMatch = trimmed.match(/^\/([a-zA-Z][a-zA-Z0-9_]*)(?:\.([a-zA-Z][a-zA-Z0-9_]*))?(?:\s+([\s\S]*))?$/)
  if (toolMatch) {
    const service = toolMatch[1]
    const action  = toolMatch[2] ?? toolMatch[1]
    return {
      type: 'tool',
      service,
      action,
      params: toolMatch[3]?.trim() ?? '',
    }
  }

  return { type: 'orc', message: trimmed }
}

// Detects whether an active @ or / trigger is open at the cursor position.
// Used to decide when to show the ChatCommandMenu.
export function getActivePrefix(
  value: string,
  cursorPos: number,
): { prefix: '@' | '/' | null; query: string } {
  const before = value.slice(0, cursorPos)

  const atMatch = before.match(/(^|\s)(@[a-zA-Z0-9_-]*)$/)
  if (atMatch) return { prefix: '@', query: atMatch[2].slice(1) }

  const slashMatch = before.match(/(^|\s)(\/[a-zA-Z0-9_.]*)$/)
  if (slashMatch) return { prefix: '/', query: slashMatch[2].slice(1) }

  return { prefix: null, query: '' }
}
