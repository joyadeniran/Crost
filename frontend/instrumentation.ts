// instrumentation.ts — runs once when the server boots (Next.js).
// Logs missing/invalid environment variables loudly (does not throw).

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { validateEnv } = await import('./lib/env')
  const result = validateEnv()
  if (!result.ok) {
    console.error('[env] Missing/invalid required environment variables:')
    for (const err of result.errors) console.error(`  - ${err}`)
  }
}
