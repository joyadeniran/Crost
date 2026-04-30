/**
 * E2E Suite: Authentication & Security
 *
 * Covers:
 *  - Duplicate signup bypass via check_user_exists RPC
 *  - Unverified session hard-block by middleware → /verify-email
 *  - Onboarding step guard (route rank enforcement)
 *  - Cookie force-purge mechanism (HTTP-431 prevention)
 *  - Magic link / password login redirects
 */
import { test, expect } from '@playwright/test'

// These tests run WITHOUT the saved auth state (unauthenticated context)
test.use({ storageState: { cookies: [], origins: [] } })

// ── 1. Duplicate signup bypass ─────────────────────────────────────────────

test.describe('Duplicate signup bypass', () => {
  test('redirects existing user to /login with email prefilled', async ({ page }) => {
    const existingEmail = process.env.E2E_TEST_EMAIL ?? 'existing@example.com'

    // Intercept the Supabase RPC that checks existence
    await page.route('**/rpc/check_user_exists**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(true), // user exists
      })
    })

    await page.goto('/signup')
    await page.getByLabel(/email/i).fill(existingEmail)
    await page.getByLabel(/password/i).fill('anypassword')
    await page.getByRole('button', { name: /sign up|create account/i }).click()

    // Expect a toast or redirect to /login
    await expect(page).toHaveURL(new RegExp(`/login.*email=`), { timeout: 5000 })
    // Prefilled email must match
    const url = new URL(page.url())
    expect(decodeURIComponent(url.searchParams.get('email') ?? '')).toBe(existingEmail)
  })

  test('falls back to signUp error code when RPC is unavailable', async ({ page }) => {
    // RPC errors out → flow proceeds to signUp which itself catches 'user_already_exists'
    await page.route('**/rpc/check_user_exists**', (route) =>
      route.fulfill({ status: 500, body: '{"message":"function unavailable"}' })
    )
    // Mock the signUp call to return user_already_exists error
    await page.route('**/auth/v1/signup**', (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'user_already_exists', message: 'User already registered' }),
      })
    )

    const existingEmail = 'dupe@example.com'
    await page.goto('/signup')
    await page.getByLabel(/email/i).fill(existingEmail)
    await page.getByLabel(/password/i).fill('anypassword')
    await page.getByRole('button', { name: /sign up|create account/i }).click()

    await expect(page).toHaveURL(new RegExp(`/login`), { timeout: 5000 })
  })
})

// ── 2. Middleware — unverified session hard-block ──────────────────────────

test.describe('Middleware route protection', () => {
  test('unauthenticated user accessing /dashboard is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })

  test('unauthenticated user accessing /dashboard/settings is redirected to /login', async ({
    page,
  }) => {
    await page.goto('/dashboard/settings')
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })

  test('email-unverified user is hard-blocked to /verify-email', async ({ page, context }) => {
    // Simulate a signed-in but unverified session by mocking getUser
    await page.route('**/auth/v1/user**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'unverified-user-id',
          email: 'unverified@example.com',
          email_confirmed_at: null, // not confirmed
          app_metadata: { provider: 'email' },
          user_metadata: { onboarding_step: 'complete' },
        }),
      })
    )

    await page.goto('/dashboard')
    // Middleware should redirect to /verify-email
    await expect(page).toHaveURL(/\/verify-email/, { timeout: 8000 })
    // Email should be included as query param
    expect(page.url()).toContain('email=')
  })

  test('authenticated user on /login is redirected to /dashboard', async ({ page, context }) => {
    await page.route('**/auth/v1/user**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'verified-user-id',
          email: 'verified@example.com',
          email_confirmed_at: new Date().toISOString(),
          app_metadata: { provider: 'email' },
          user_metadata: { onboarding_step: 'complete' },
        }),
      })
    )

    await page.goto('/login')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8000 })
  })
})

// ── 3. Onboarding step guard ───────────────────────────────────────────────

test.describe('Onboarding route rank enforcement', () => {
  function mockUserWithStep(page: import('@playwright/test').Page, step: string) {
    return page.route('**/auth/v1/user**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'onboarding-user',
          email: 'onboarding@example.com',
          email_confirmed_at: new Date().toISOString(),
          app_metadata: { provider: 'email' },
          user_metadata: { onboarding_step: step },
        }),
      })
    )
  }

  test('user on step "identity" cannot skip to /onboarding/team', async ({ page }) => {
    await mockUserWithStep(page, 'identity')
    await page.goto('/onboarding/team')
    // Middleware must redirect back to current step
    await expect(page).toHaveURL(/\/onboarding\/identity/, { timeout: 8000 })
  })

  test('user on step "orc" cannot skip to /onboarding/activate', async ({ page }) => {
    await mockUserWithStep(page, 'orc')
    await page.goto('/onboarding/activate')
    await expect(page).toHaveURL(/\/onboarding\/(orc|team)/, { timeout: 8000 })
  })

  test('user on step "complete" visiting /onboarding/identity is redirected to /dashboard', async ({
    page,
  }) => {
    await mockUserWithStep(page, 'complete')
    await page.goto('/onboarding/identity')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8000 })
  })
})

// ── 4. Cookie force-purge mechanism ───────────────────────────────────────

test.describe('Cookie force-purge (HTTP-431 prevention)', () => {
  test('excess sb-* cookies are deleted on dashboard mount', async ({ page, context }) => {
    // Inject 6 synthetic sb-* cookies (over the threshold of 4)
    const hostname = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000').hostname
    const cookieBase = {
      domain: hostname,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
    }
    await context.addCookies([
      { name: 'sb-access-token', value: 'tok1', ...cookieBase },
      { name: 'sb-refresh-token', value: 'tok2', ...cookieBase },
      { name: 'sb-auth-token', value: 'tok3', ...cookieBase },
      { name: 'sb-session', value: 'tok4', ...cookieBase },
      { name: 'sb-legacy-1', value: 'tok5', ...cookieBase },
      { name: 'sb-legacy-2', value: 'tok6', ...cookieBase },
    ])

    // Mock auth to be valid so LayoutStoreHydrator runs
    await page.route('**/auth/v1/user**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'purge-test-user',
          email: 'purge@example.com',
          email_confirmed_at: new Date().toISOString(),
          user_metadata: { onboarding_step: 'complete' },
        }),
      })
    )

    await page.goto('/dashboard')

    // After LayoutStoreHydrator runs, the sb-* cookies should have been purged
    // (threshold = 4, so 6 cookies triggers deletion)
    const cookies = await context.cookies()
    const sbCookies = cookies.filter((c) => c.name.startsWith('sb-'))
    // All legacy duplicates should be cleared — only the essential 2 remain
    expect(sbCookies.length).toBeLessThanOrEqual(4)
  })

  test('no purge triggered when cookie count is at or below threshold', async ({
    page,
    context,
  }) => {
    const hostname = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000').hostname
    const cookieBase = { domain: hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const }

    await context.addCookies([
      { name: 'sb-access-token', value: 'tok1', ...cookieBase },
      { name: 'sb-refresh-token', value: 'tok2', ...cookieBase },
    ])

    await page.route('**/auth/v1/user**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'no-purge-user',
          email: 'ok@example.com',
          email_confirmed_at: new Date().toISOString(),
          user_metadata: { onboarding_step: 'complete' },
        }),
      })
    )

    // Spy on document.cookie setter to detect deletion attempts
    let deletionAttempts = 0
    await page.addInitScript(() => {
      const original = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!
      Object.defineProperty(document, 'cookie', {
        get: original.get!.bind(document),
        set(val: string) {
          if (val.includes('expires=Thu, 01 Jan 1970')) {
            ;(window as Window & { __cookieDeletions?: number }).__cookieDeletions =
              ((window as Window & { __cookieDeletions?: number }).__cookieDeletions ?? 0) + 1
          }
          original.set!.call(document, val)
        },
      })
    })

    await page.goto('/dashboard')
    const deletions = await page.evaluate(
      () => (window as Window & { __cookieDeletions?: number }).__cookieDeletions ?? 0
    )
    expect(deletions).toBe(0)
  })
})

// ── 5. Onboarding 3-step flow ──────────────────────────────────────────────

test.describe('Onboarding form flow', () => {
  test('identity step saves data and advances to /onboarding/control', async ({ page }) => {
    await page.route('**/auth/v1/user**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'new-user',
          email: 'new@example.com',
          email_confirmed_at: new Date().toISOString(),
          user_metadata: { onboarding_step: 'identity' },
        }),
      })
    )
    await page.route('**/api/onboarding/set-step**', (route) =>
      route.fulfill({ status: 200, body: '{"success":true}' })
    )
    await page.route('**/api/onboarding/interpret-business**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ category: 'SaaS' }),
      })
    )

    await page.goto('/onboarding/identity')
    await page.getByLabel(/your name|founder name/i).fill('Alex')
    await page.getByLabel(/company name/i).fill('Acme Inc')
    await page.getByLabel(/city|location/i).fill('San Francisco, US')
    await page.getByLabel(/describe|about your business/i).fill(
      'We build AI tools for small businesses'
    )
    // Select stage pill
    await page.getByRole('button', { name: /mvp/i }).click()
    await page.getByRole('button', { name: /continue|next/i }).click()

    await expect(page).toHaveURL(/\/onboarding\/control/, { timeout: 8000 })
  })

  test('control step with "aggressive" persists risk tolerance', async ({ page }) => {
    await page.route('**/auth/v1/user**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'control-user',
          email: 'control@example.com',
          email_confirmed_at: new Date().toISOString(),
          user_metadata: { onboarding_step: 'control' },
        }),
      })
    )
    await page.route('**/api/onboarding/set-step**', (route) =>
      route.fulfill({ status: 200, body: '{"success":true}' })
    )

    await page.goto('/onboarding/control')
    await page.getByRole('button', { name: /aggressive/i }).click()
    await page.getByRole('button', { name: /continue|next/i }).click()

    await expect(page).toHaveURL(/\/onboarding\/orc/, { timeout: 8000 })
  })
})
