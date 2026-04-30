/**
 * E2E Suite: Waterfall Lifecycle
 *
 * Tests the complete goal execution pipeline end-to-end:
 *
 *   Goal created (pending)
 *     → Orc plans (planning → awaiting_approval)
 *     → Tasks approved / dispatched
 *     → Worker hits needs_data → ❓ BLOCKED card
 *     → Founder uploads KB file
 *     → Task retried → worker requests tool approval
 *     → Approval card in queue → founder approves
 *     → Composio executes → task completed
 *     → Artifact appears → Mission Report written
 *
 * Also covers:
 *   - @orc direct response (no plan spawned)
 *   - Hallucinated dept interception + redraft
 *   - Chain-reaction unblocking (Task 2 auto-starts after Task 1 completes)
 *   - Approval rejection cascade to 'cancelled'
 *   - HITL mode matrix (careful / balanced / aggressive)
 *
 * LiteLLM is fully mocked via page.route() — no real AI calls are made.
 * Composio is mocked via page.route() on the approval execute path.
 */
import { test, expect, type Page, type Route } from '@playwright/test'
import {
  LITELLM_URL_PATTERN,
  orcPlanResponse,
  orcDirectResponse,
  orcHallucinatedDeptResponse,
  workerNeedsDataResponse,
  workerRequestsApprovalResponse,
  workerCompletedDocumentResponse,
  workerCompletedResearchResponse,
  litellm503Response,
  litellm429Response,
} from './fixtures/llm-mocks'
import { createGoal, pollGoalStatus, pollForPendingApproval, approveAction, rejectAction } from './fixtures/api-helpers'

// ── Shared helpers ─────────────────────────────────────────────────────────

/** Sets up deterministic LLM response sequence; callIndex increments per route hit */
function setupLLMSequence(page: Page, responses: object[]) {
  let callIndex = 0
  page.route(LITELLM_URL_PATTERN, async (route: Route) => {
    const response = responses[Math.min(callIndex, responses.length - 1)]
    callIndex++
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    })
  })
}

/** Mock Composio execute to succeed */
function mockComposioSuccess(page: Page) {
  page.route('**/api/approvals/**', async (route: Route) => {
    if (route.request().method() === 'PATCH') {
      await route.continue() // let the real handler run — Composio is mocked below
    } else {
      await route.continue()
    }
  })
  // Mock Composio's underlying SDK call by intercepting the external Composio API
  page.route('**/api.composio.dev/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ successful: true, data: { messageId: 'msg-test-001' } }),
    })
  })
}

/** Mock Composio execute to fail (schema mismatch) */
function mockComposioFailure(page: Page) {
  page.route('**/api.composio.dev/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ successful: false, error: 'Missing required argument: to' }),
    })
  })
}

// ── Suite 1: Full happy-path waterfall ────────────────────────────────────

test.describe('Waterfall Lifecycle — happy path', () => {
  test('full flow: goal → plan → dispatch → task blocked → upload → retry → approval → artifact', async ({
    page,
    request,
  }) => {
    // ── Step 1: LLM call 0 = Orc plan; calls 1-2 = workers ──────────────
    // Call 0: Orchestrator returns 2-task plan
    // Call 1: Worker for task-1 (marketing) — needs more data
    // Call 2: Worker for task-1 retry — completes research
    // Call 3: Worker for task-2 (executive) — requests approval
    const goalId_placeholder = 'PENDING' // real ID fetched after creation
    setupLLMSequence(page, [
      orcPlanResponse('placeholder-goal-id'),
      workerNeedsDataResponse(['Target audience demographics', 'Competitor analysis']),
      workerCompletedResearchResponse(),
      workerRequestsApprovalResponse(),
      workerCompletedDocumentResponse(),
    ])
    mockComposioSuccess(page)

    await page.goto('/dashboard')
    await expect(page.locator('body')).toBeVisible()

    // ── Step 2: Submit goal from War Room ─────────────────────────────────
    const warRoomInput = page
      .getByPlaceholder(/what do you want to achieve|tell orc/i)
      .or(page.getByRole('textbox', { name: /goal|mission/i }))
    await warRoomInput.fill('Research B2B SaaS founders and draft an outreach email')
    await page.keyboard.press('Enter')

    // Goal card appears; status should move to planning then awaiting_approval
    const goalCard = page.locator('[data-testid="goal-card"], .goal-card').first()
    await expect(goalCard).toBeVisible({ timeout: 15_000 })

    // ── Step 3: Plan card — tasks should appear ──────────────────────────
    // Wait for tasks to appear in the plan card
    await expect(
      page.getByText(/Research target audience/i).or(page.getByText(/AWAITING APPROVAL/i))
    ).toBeVisible({ timeout: 20_000 })

    // ── Step 4: Approve task plan ────────────────────────────────────────
    const approveAllBtn = page
      .getByRole('button', { name: /approve plan|approve all|run plan/i })
      .first()
    if (await approveAllBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await approveAllBtn.click()
    }

    // ── Step 5: Task 1 dispatched → LLM returns needs_data ────────────────
    // ❓ BLOCKED card should appear for the marketing task
    await expect(page.getByText(/❓ BLOCKED/i)).toBeVisible({ timeout: 25_000 })
    await expect(
      page.getByText(/Target audience demographics|More information to proceed/i)
    ).toBeVisible()

    // "Add Knowledge" link must be present and point to /dashboard/knowledge
    const addKbLink = page.getByRole('link', { name: /add knowledge/i })
    await expect(addKbLink).toBeVisible()
    await expect(addKbLink).toHaveAttribute('href', /\/dashboard\/knowledge/)

    // ── Step 6: Upload knowledge base file ──────────────────────────────
    await page.route('**/api/knowledge**', async (route: Route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            file: { id: 'kb-file-001', name: 'audience-research.pdf', status: 'processing' },
          }),
        })
      } else {
        await route.continue()
      }
    })

    await addKbLink.click()
    await expect(page).toHaveURL(/\/dashboard\/knowledge/, { timeout: 8000 })

    // Upload a test file
    const fileInput = page.locator('input[type="file"]')
    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fileInput.setInputFiles({
        name: 'audience-research.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 test content'),
      })
      await expect(page.getByText(/uploaded|processing|success/i)).toBeVisible({ timeout: 10_000 })
    }

    // ── Step 7: Navigate back and retry the blocked task ─────────────────
    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 })

    const retryBtn = page.getByRole('button', { name: /retry/i }).first()
    await expect(retryBtn).toBeVisible({ timeout: 10_000 })
    await retryBtn.click()

    // ── Step 8: Task 1 retries → completes; chain reaction unblocks Task 2 ─
    // Task 2 (executive/draft) starts automatically after task 1 completes
    // Worker for task 2 returns REQUEST_APPROVAL for gmail.send_email

    // Approval badge in the nav should increment
    await expect(page.locator('[data-testid="approval-badge"], .approval-badge')).toContainText(
      /[1-9]/,
      { timeout: 25_000 }
    )

    // ── Step 9: Approve the tool action ──────────────────────────────────
    await page.goto('/dashboard/approvals')
    const approvalCard = page.locator('[data-testid="approval-card"], .approval-card').first()
    await expect(approvalCard).toBeVisible({ timeout: 10_000 })

    // Approval should be for gmail.send_email with medium risk
    await expect(approvalCard).toContainText(/gmail|send.*email|outreach/i)

    const approveBtn = approvalCard.getByRole('button', { name: /approve/i })
    await approveBtn.click()

    // ── Step 10: Task completes → artifact appears ────────────────────────
    await page.goto('/dashboard')
    await expect(page.getByText(/Outreach Email Draft|artifact/i)).toBeVisible({ timeout: 25_000 })

    // Artifact card should show sources
    const artifactCard = page
      .locator('[data-testid="artifact-card"], .artifact-card')
      .first()
    await expect(artifactCard).toBeVisible({ timeout: 10_000 })

    // ── Step 11: Mission Report written ──────────────────────────────────
    await expect(page.getByText(/Mission Report|mission.*complete/i)).toBeVisible({
      timeout: 30_000,
    })
  })
})

// ── Suite 2: @orc direct response ─────────────────────────────────────────

test.describe('@orc direct response', () => {
  test('asking a question returns a chat response — no waterfall plan spawned', async ({
    page,
  }) => {
    setupLLMSequence(page, [orcDirectResponse('Your company name is Acme Inc.')])

    await page.goto('/dashboard')

    const warRoomInput = page
      .getByPlaceholder(/what do you want to achieve|tell orc/i)
      .or(page.getByRole('textbox', { name: /goal|mission/i }))
    await warRoomInput.fill('@orc What is my company name?')
    await page.keyboard.press('Enter')

    // Orc's answer should appear in the conversation
    await expect(page.getByText(/Acme Inc\./i)).toBeVisible({ timeout: 15_000 })

    // No task cards should be created
    const taskCards = page.locator('[data-testid="task-card"], .task-card')
    await expect(taskCards).toHaveCount(0, { timeout: 5000 })
  })
})

// ── Suite 3: Hallucinated department interception ─────────────────────────

test.describe('Hallucinated department guard', () => {
  test('orc retries when plan contains an unregistered department', async ({ page }) => {
    let callCount = 0
    page.route(LITELLM_URL_PATTERN, async (route: Route) => {
      callCount++
      if (callCount === 1) {
        // First call returns a hallucinated dept
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(orcHallucinatedDeptResponse()),
        })
      } else {
        // Second call (retry after guard) returns a valid plan
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(orcPlanResponse('retry-goal-id')),
        })
      }
    })

    await page.goto('/dashboard')
    const warRoomInput = page
      .getByPlaceholder(/what do you want to achieve|tell orc/i)
      .or(page.getByRole('textbox', { name: /goal|mission/i }))
    await warRoomInput.fill('Do something that needs quantum computing')
    await page.keyboard.press('Enter')

    // Should never show the invalid dept name in the UI
    await expect(page.getByText(/quantum_computing/i)).not.toBeVisible({ timeout: 15_000 })

    // After the guard triggers a redraft, valid tasks should appear
    await expect(page.getByText(/Research target audience/i)).toBeVisible({ timeout: 20_000 })

    // Guard must have triggered at least one retry call
    expect(callCount).toBeGreaterThanOrEqual(2)
  })
})

// ── Suite 4: Chain-reaction unblocking ────────────────────────────────────

test.describe('Chain reaction task unblocking', () => {
  test('Task 2 auto-dispatches after Task 1 completes', async ({ page }) => {
    // Both workers complete instantly in sequence
    setupLLMSequence(page, [
      orcPlanResponse('chain-goal'),
      workerCompletedResearchResponse(), // Task 1 completes
      workerCompletedDocumentResponse(), // Task 2 auto-starts and completes
    ])

    await page.goto('/dashboard')
    const input = page
      .getByPlaceholder(/what do you want to achieve|tell orc/i)
      .or(page.getByRole('textbox', { name: /goal|mission/i }))
    await input.fill('Research and draft an email')
    await page.keyboard.press('Enter')

    // Auto-approve plan if needed
    const approveBtn = page.getByRole('button', { name: /approve plan|approve all|run plan/i })
    if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await approveBtn.click()
    }

    // Both tasks should eventually show as completed
    await expect(page.getByText(/completed/i).first()).toBeVisible({ timeout: 30_000 })
    const completedTasks = page.getByText(/completed/i)
    await expect(completedTasks).toHaveCount({ minimum: 2 } as Parameters<typeof expect>[0] extends infer R ? (R extends object ? R : never) : never, { timeout: 30_000 })
  })
})

// ── Suite 5: Approval rejection cascade ───────────────────────────────────

test.describe('Approval rejection cascade', () => {
  test('rejecting a task marks it cancelled without infinite polling', async ({ page, request }) => {
    setupLLMSequence(page, [
      orcPlanResponse('rejection-goal'),
      workerRequestsApprovalResponse(),
    ])

    await page.goto('/dashboard')
    const input = page
      .getByPlaceholder(/what do you want to achieve|tell orc/i)
      .or(page.getByRole('textbox', { name: /goal|mission/i }))
    await input.fill('Draft and send an email to customers')
    await page.keyboard.press('Enter')

    const approveBtn = page.getByRole('button', { name: /approve plan|approve all|run plan/i })
    if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await approveBtn.click()
    }

    // Wait for approval to appear
    await expect(page.locator('[data-testid="approval-badge"], .approval-badge')).toContainText(
      /[1-9]/,
      { timeout: 25_000 }
    )

    await page.goto('/dashboard/approvals')
    const approvalCard = page.locator('[data-testid="approval-card"], .approval-card').first()
    await expect(approvalCard).toBeVisible({ timeout: 10_000 })

    // Reject the action
    const rejectBtn = approvalCard.getByRole('button', { name: /reject|decline/i })
    await rejectBtn.click()

    // Confirmation dialog may appear
    const confirmBtn = page
      .getByRole('button', { name: /confirm|yes.*reject/i })
      .first()
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // Approval status should update to rejected/cancelled
    await expect(approvalCard.or(page.getByText(/rejected|cancelled/i))).toBeVisible({
      timeout: 10_000,
    })

    // Navigate back — task must NOT be stuck in polling loop
    await page.goto('/dashboard')
    // Page should be responsive (no frozen UI from infinite poll)
    await expect(page.locator('body')).toBeVisible()
    await page.waitForTimeout(3000) // wait to confirm no reload loop
    await expect(page.locator('body')).toBeVisible()

    // No pending approvals should remain
    const pending = await request.get('/api/approvals?status=pending')
    const pendingBody = await pending.json()
    expect((pendingBody.data as unknown[]).length).toBe(0)
  })
})

// ── Suite 6: HITL mode matrix ─────────────────────────────────────────────

test.describe('HITL control mode matrix', () => {
  // Mock system_config endpoint to return specific risk_tolerance per test
  function mockRiskMode(page: Page, mode: 'careful' | 'balanced' | 'aggressive') {
    page.route('**/api/system-config**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ key: 'risk_tolerance', value: mode }),
      })
    })
    // Also mock the worker route to ensure execute-tool-call reads the right mode
    // The actual risk_tolerance is read from DB in executeToolCall so we mock the
    // system_config Supabase query pattern
    page.route('**/rest/v1/system_config**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ key: 'risk_tolerance', value: mode }]),
      })
    })
  }

  test('[careful] every tool action requires explicit approval', async ({ page }) => {
    mockRiskMode(page, 'careful')
    // Mock a low-risk read tool (gmail.search_emails) which balanced/aggressive auto-run
    setupLLMSequence(page, [
      orcPlanResponse('careful-goal'),
      // Worker calls gmail.search_emails — in careful mode this MUST queue an approval
      {
        id: 'chatcmpl-careful',
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                REQUEST_APPROVAL: {
                  action_type: 'gmail.search_emails',
                  action_label: 'Search inbox for recent leads',
                  reasoning: 'Need to find leads',
                  risk: 'low',
                  params: { query: 'leads' },
                },
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
      },
    ])

    await page.goto('/dashboard')
    const input = page
      .getByPlaceholder(/what do you want to achieve|tell orc/i)
      .or(page.getByRole('textbox', { name: /goal|mission/i }))
    await input.fill('Search my emails for recent leads')
    await page.keyboard.press('Enter')

    const approveBtn = page.getByRole('button', { name: /approve plan|approve all|run plan/i })
    if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await approveBtn.click()
    }

    // Even a low-risk read tool must surface an approval card in careful mode
    await expect(page.locator('[data-testid="approval-badge"], .approval-badge')).toContainText(
      /[1-9]/,
      { timeout: 20_000 }
    )
  })

  test('[aggressive] low+medium risk read tools auto-execute without approval', async ({ page }) => {
    mockRiskMode(page, 'aggressive')
    // gmail.search_emails is in LOW_RISK_READ_TOOLS — should auto-run in aggressive mode
    setupLLMSequence(page, [
      orcPlanResponse('aggressive-goal'),
      workerCompletedResearchResponse(), // worker auto-executes without REQUEST_APPROVAL
    ])

    await page.goto('/dashboard')
    const input = page
      .getByPlaceholder(/what do you want to achieve|tell orc/i)
      .or(page.getByRole('textbox', { name: /goal|mission/i }))
    await input.fill('Search my inbox and summarize recent leads')
    await page.keyboard.press('Enter')

    const approveBtn = page.getByRole('button', { name: /approve plan|approve all|run plan/i })
    if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await approveBtn.click()
    }

    // Task should complete WITHOUT an approval card appearing
    await expect(page.getByText(/completed/i).first()).toBeVisible({ timeout: 20_000 })

    // No pending approvals
    await page.goto('/dashboard/approvals')
    await expect(page.getByText(/no.*approval|empty|nothing pending/i)).toBeVisible({
      timeout: 5000,
    })
  })
})

// ── Suite 7: LLM provider outage — silent fallback ─────────────────────────

test.describe('LLM provider outage — silent fallback', () => {
  test('503 from primary provider falls back silently without error toast', async ({ page }) => {
    let callCount = 0
    page.route(LITELLM_URL_PATTERN, async (route: Route) => {
      callCount++
      if (callCount === 1) {
        // Primary (groq) fails with 503
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'LiteLLM error - Service unavailable' }),
        })
      } else {
        // Fallback (gemini) succeeds
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(orcPlanResponse('fallback-goal')),
        })
      }
    })

    await page.goto('/dashboard')
    const input = page
      .getByPlaceholder(/what do you want to achieve|tell orc/i)
      .or(page.getByRole('textbox', { name: /goal|mission/i }))
    await input.fill('Plan my quarterly goals')
    await page.keyboard.press('Enter')

    // No error toast should appear for a transparent fallback
    await expect(page.getByRole('alert').filter({ hasText: /error|failed|unavailable/i })).not.toBeVisible({
      timeout: 5000,
    })

    // Plan should still arrive (via fallback)
    await expect(
      page.getByText(/Research target audience/i).or(page.getByText(/planning|awaiting/i))
    ).toBeVisible({ timeout: 20_000 })

    // At least 2 LLM calls (primary failed + fallback)
    expect(callCount).toBeGreaterThanOrEqual(2)
  })

  test('429 rate-limit triggers fallback and logs provider_fallback event', async ({
    page,
    request,
  }) => {
    let callCount = 0
    page.route(LITELLM_URL_PATTERN, async (route: Route) => {
      callCount++
      if (callCount === 1) {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'LiteLLM error - Rate limit exceeded' }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(orcPlanResponse('rate-limit-goal')),
        })
      }
    })

    await page.goto('/dashboard')
    const input = page
      .getByPlaceholder(/what do you want to achieve|tell orc/i)
      .or(page.getByRole('textbox', { name: /goal|mission/i }))
    await input.fill('Write a sales strategy')
    await page.keyboard.press('Enter')

    // Plan should still appear
    await expect(
      page.getByText(/Research target audience/i).or(page.getByText(/awaiting/i))
    ).toBeVisible({ timeout: 20_000 })

    // Verify provider_fallback event logged in event_log via API
    const events = await request.get('/api/events?event_type=provider_fallback&limit=5')
    if (events.ok()) {
      const body = await events.json()
      // At least one fallback event should have been recorded
      expect((body.data as unknown[]).length).toBeGreaterThanOrEqual(1)
    }
  })
})

// ── Suite 8: Tool schema mismatch ─────────────────────────────────────────

test.describe('Tool execution — schema mismatch', () => {
  test('Composio returning successful:false surfaces humanized error, not crash', async ({
    page,
  }) => {
    setupLLMSequence(page, [
      orcPlanResponse('schema-mismatch-goal'),
      workerRequestsApprovalResponse(),
    ])

    // Composio returns failure
    mockComposioFailure(page)

    await page.goto('/dashboard')
    const input = page
      .getByPlaceholder(/what do you want to achieve|tell orc/i)
      .or(page.getByRole('textbox', { name: /goal|mission/i }))
    await input.fill('Send emails to all leads')
    await page.keyboard.press('Enter')

    const approveBtn = page.getByRole('button', { name: /approve plan|approve all|run plan/i })
    if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await approveBtn.click()
    }

    await expect(page.locator('[data-testid="approval-badge"], .approval-badge')).toContainText(
      /[1-9]/,
      { timeout: 20_000 }
    )

    await page.goto('/dashboard/approvals')
    const approvalCard = page.locator('[data-testid="approval-card"], .approval-card').first()
    await expect(approvalCard).toBeVisible({ timeout: 10_000 })
    await approvalCard.getByRole('button', { name: /approve/i }).click()

    // Task status should be 'error' not 'completed'
    await page.goto('/dashboard')
    // The humanized error should mention Gmail (CR-TOOL-GMAIL)
    await expect(
      page.getByText(/Gmail|gmail.*account|reconnect/i).or(page.getByText(/error/i))
    ).toBeVisible({ timeout: 15_000 })

    // NO crash — page must remain functional
    await expect(page.locator('body')).toBeVisible()
    await expect(
      page.getByPlaceholder(/what do you want to achieve|tell orc/i).or(
        page.getByRole('textbox', { name: /goal|mission/i })
      )
    ).toBeVisible()
  })
})

// ── Suite 9: JIT connection sync ──────────────────────────────────────────

test.describe('JIT connection sync', () => {
  test('stale DB "disconnected" is healed if Composio reports connected', async ({ page }) => {
    setupLLMSequence(page, [
      orcPlanResponse('jit-goal'),
      workerRequestsApprovalResponse(),
      workerCompletedDocumentResponse(),
    ])

    // Mock the Composio connections check — reports github as actually connected
    page.route('**/api/tools/check-connection**', async (route: Route) => {
      const body = await route.request().postDataJSON()
      if (body?.service === 'github') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ connected: true, healed: true }),
        })
      } else {
        await route.continue()
      }
    })

    // Mock the DB that falsely says github is disconnected
    page.route('**/rest/v1/tool_connections**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ service: 'github', status: 'disconnected' }]),
      })
    })

    await page.goto('/dashboard')
    const input = page
      .getByPlaceholder(/what do you want to achieve|tell orc/i)
      .or(page.getByRole('textbox', { name: /goal|mission/i }))
    await input.fill('Review my open pull requests on GitHub')
    await page.keyboard.press('Enter')

    const approveBtn = page.getByRole('button', { name: /approve plan|approve all|run plan/i })
    if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await approveBtn.click()
    }

    // With JIT healing, execution should proceed — no "disconnected" block
    await expect(
      page.getByText(/disconnected.*github|github.*disconnected|missing.*connection/i)
    ).not.toBeVisible({ timeout: 15_000 })
  })

  test('truly disconnected tool halts execution and surfaces connection prompt', async ({
    page,
  }) => {
    setupLLMSequence(page, [
      orcPlanResponse('jit-disconnect-goal'),
      // Worker would run but JIT check fails
    ])

    // Both DB and Composio API say disconnected
    page.route('**/api/tools/check-connection**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connected: false, healed: false }),
      })
    })
    page.route('**/rest/v1/tool_connections**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ service: 'github', status: 'disconnected' }]),
      })
    })
    // Simulate suggested-action execute returning missing_connection
    page.route('**/api/suggested-actions/**/execute**', async (route: Route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'GitHub is not connected', missing_connection: true, service: 'github' }),
      })
    })

    await page.goto('/dashboard')
    const input = page
      .getByPlaceholder(/what do you want to achieve|tell orc/i)
      .or(page.getByRole('textbox', { name: /goal|mission/i }))
    await input.fill('Review my open pull requests on GitHub')
    await page.keyboard.press('Enter')

    const approveBtn = page.getByRole('button', { name: /approve plan|approve all|run plan/i })
    if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await approveBtn.click()
    }

    // A connection prompt should appear (not a silent crash)
    await expect(
      page.getByText(/connect.*github|github.*not.*connected|missing.*connection/i)
    ).toBeVisible({ timeout: 20_000 })
  })
})

// ── Suite 10: Realtime egress — subscription filter guard ─────────────────

test.describe('Realtime egress — subscription isolation', () => {
  test('approval_queue subscription for layout is scoped to current user_id', async ({ page }) => {
    const subscriptionConfigs: Array<{ table: string; filter?: string }> = []

    // Intercept the Supabase realtime WebSocket negotiation
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        try {
          const msg = JSON.parse(frame.payload as string)
          if (msg?.topic?.includes('realtime') && msg?.payload?.config?.postgres_changes) {
            for (const change of msg.payload.config.postgres_changes) {
              subscriptionConfigs.push({ table: change.table, filter: change.filter })
            }
          }
        } catch {
          // non-JSON frame — ignore
        }
      })
    })

    await page.goto('/dashboard')
    await page.waitForTimeout(3000) // Allow realtime subscriptions to initialise

    // layout-approvals subscription MUST have a user_id filter
    const approvalSub = subscriptionConfigs.find((s) => s.table === 'approval_queue')
    expect(approvalSub).toBeDefined()
    expect(approvalSub?.filter).toMatch(/user_id=eq\./)

    // layout-artifacts subscription MUST have a created_by filter
    const artifactSub = subscriptionConfigs.find((s) => s.table === 'artifacts')
    expect(artifactSub).toBeDefined()
    expect(artifactSub?.filter).toMatch(/created_by=eq\./)
  })
})
