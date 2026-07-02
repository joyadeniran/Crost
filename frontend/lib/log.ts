// lib/log.ts
// Structured logging (Phase 3, 10x rebuild) — single JSON-lines logger to
// replace scattered console.* calls in the engine/worker layer.
//
// Scope note: rolled out to lib/engine/*.ts this session (the module this
// rebuild already owns end-to-end from Phase 2.1). Routes and
// scripts/worker.ts still use console.* directly — left alone rather than
// doing a blind repo-wide find/replace; migrate incrementally the same way
// Phase 2.3's auth guard was rolled out route-by-route.
//
// Server-side ONLY.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogFields {
  userId?: string | null
  goalId?: string | null
  taskId?: string | null
  module?: string
  [key: string]: unknown
}

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  const line = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  }
  const serialized = JSON.stringify(line)
  if (level === 'error') console.error(serialized)
  else if (level === 'warn') console.warn(serialized)
  else console.log(serialized)
}

export const log = {
  debug: (message: string, fields?: LogFields) => emit('debug', message, fields),
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
}
