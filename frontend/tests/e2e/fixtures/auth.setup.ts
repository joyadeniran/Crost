/**
 * Playwright global setup — authenticates a test user once and saves the
 * browser storage state so all spec files start already signed in.
 *
 * Env vars required:
 *   E2E_TEST_EMAIL    — a real Supabase user that already completed onboarding
 *   E2E_TEST_PASSWORD — that user's password
 */
import { test as setup, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const AUTH_FILE = path.join(__dirname, '../.auth/session.json')

setup('authenticate test user', async ({ page }) => {
  // Ensure directory exists
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })

  const email = process.env.E2E_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD

  if (!email || !password) {
    throw new Error(
      'E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set.\n' +
        'Create a dedicated test account in your Supabase project.'
    )
  }

  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()

  // Wait until middleware redirects to dashboard (onboarding already complete)
  await page.waitForURL('**/dashboard**', { timeout: 20_000 })
  await expect(page).toHaveURL(/dashboard/)

  await page.context().storageState({ path: AUTH_FILE })
})
