/**
 * Unit tests: next.config.js (Phase 4 — security headers).
 * Requires the actual config module (CommonJS) and exercises its async
 * headers() function the same way Next.js would at request time.
 */
import { describe, it, expect } from 'vitest'
import path from 'path'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextConfig = require(path.resolve(__dirname, '../../next.config.js'))

describe('next.config.js — security headers', () => {
  it('applies headers to all routes via a single catch-all source', async () => {
    const rules = await nextConfig.headers()
    expect(rules).toHaveLength(1)
    expect(rules[0].source).toBe('/:path*')
  })

  it('includes Content-Security-Policy-Report-Only (not yet enforcing)', async () => {
    const [{ headers }] = await nextConfig.headers()
    const csp = headers.find((h: any) => h.key === 'Content-Security-Policy-Report-Only')
    expect(csp).toBeDefined()
    expect(csp.value).toContain("default-src 'self'")
    // Enforcing CSP header should NOT also be present yet (report-only first).
    expect(headers.some((h: any) => h.key === 'Content-Security-Policy')).toBe(false)
  })

  it('sets X-Frame-Options: DENY', async () => {
    const [{ headers }] = await nextConfig.headers()
    expect(headers).toContainEqual({ key: 'X-Frame-Options', value: 'DENY' })
  })

  it('sets X-Content-Type-Options: nosniff', async () => {
    const [{ headers }] = await nextConfig.headers()
    expect(headers).toContainEqual({ key: 'X-Content-Type-Options', value: 'nosniff' })
  })

  it('sets a Strict-Transport-Security header with includeSubDomains and a >=1yr max-age', async () => {
    const [{ headers }] = await nextConfig.headers()
    const hsts = headers.find((h: any) => h.key === 'Strict-Transport-Security')
    expect(hsts).toBeDefined()
    expect(hsts.value).toContain('includeSubDomains')
    const maxAge = parseInt(hsts.value.match(/max-age=(\d+)/)[1], 10)
    expect(maxAge).toBeGreaterThanOrEqual(31536000) // >= 1 year
  })

  it('sets a Referrer-Policy header', async () => {
    const [{ headers }] = await nextConfig.headers()
    expect(headers.some((h: any) => h.key === 'Referrer-Policy')).toBe(true)
  })
})

describe('next.config.js — Next 14 compatibility', () => {
  it('does not set the invalid top-level serverExternalPackages key (Next 15 only)', () => {
    expect(nextConfig.serverExternalPackages).toBeUndefined()
  })

  it('sets serverComponentsExternalPackages under experimental instead (Next 14 key)', () => {
    expect(Array.isArray(nextConfig.experimental?.serverComponentsExternalPackages)).toBe(true)
    expect(nextConfig.experimental.serverComponentsExternalPackages).toContain('pg')
    expect(nextConfig.experimental.serverComponentsExternalPackages).toContain('firebase-admin')
  })

  it('preserves the existing serverActions allowedOrigins config', () => {
    expect(nextConfig.experimental?.serverActions?.allowedOrigins).toContain('app.crosthq.com')
  })

  it('does not define experimental twice (object key collision would silently drop the first)', () => {
    const src = require('fs').readFileSync(path.resolve(__dirname, '../../next.config.js'), 'utf8')
    const matches = src.match(/^\s*experimental:\s*\{/gm) ?? []
    expect(matches).toHaveLength(1)
  })
})
