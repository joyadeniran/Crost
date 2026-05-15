/**
 * Vitest global setup — runs once before all unit tests.
 * Mocks environment variables and global fetch.
 */
import { vi, beforeEach, afterEach } from 'vitest'

// ── Environment variables required by llm-client.ts ──────────────────────
process.env.LITELLM_BASE_URL = 'http://mock-litellm.test'
process.env.LITELLM_MASTER_KEY = 'test-master-key'
process.env.CLOUD_MODEL = 'groq/llama-3.3-70b-versatile'
process.env.CLOUD_MODEL_WORKER = 'groq/llama-3.3-70b-versatile'
process.env.ENV_MODE = 'cloud'
process.env.FREE_SYSTEM_DAILY_TOKENS = '50000'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://mock-supabase.test'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'
process.env.COMPOSIO_API_KEY = 'mock-composio-key'

// ── Global fetch mock ─────────────────────────────────────────────────────
// Tests that need specific fetch behaviour set it via vi.mocked(fetch)
global.fetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})
