# CROST — Remediation Handoff (Agent Context Bundle)

> **Purpose:** Single file an incoming agent (any model, any session) reads to skip all rediscovery work.
> Pair this with `CODEBASE_AUDIT_REPORT.md` for full evidence. This file is the **executable summary**.
> **Last verified:** May 15, 2026 against `main` HEAD `71f7de9` (post-audit merge).

---

## 0. STOP — DO NOT REDO THESE

If you are a fresh agent, **do not** waste tokens on these — they're already done:

- ✅ Full codebase audit (see `CODEBASE_AUDIT_REPORT.md`, 1088 lines, 18 findings)
- ✅ Cross-branch comparison with 7 other branches
- ✅ Validation: `main` is authoritative; api-doc has zero unique security fixes; cherry-picking from api-doc is data-corrupting (incompatible `connections` schema)
- ✅ Branch consolidation: audit merged into `main`; local branches cleaned
- ❌ Remote branches still exist (git server rejected `--delete` with 403; user must delete via GitHub UI or `gh api -X DELETE /repos/joyadeniran/Crost/git/refs/heads/<branch>`)

**Stale remote branches to delete manually** (order: longest-stale first):
`fix/approval-flow-and-notifications`, `claude/fix-knowledge-base-upload-zay4O`, `claude/fix-usecallback-import`, `claude/fix-website-loading-1ultt`, `claude/production-ready-code-DMxPH`, `audit-deep-dive`, `claude/api-documentation-evaluation-cNIVx`, `claude/fix-orc-response-mode-gksSd`

---

## 1. PROJECT MAP (read this once, don't re-explore)

**Crost** = AI Company Operating System. Next.js 14 (App Router) + Supabase + Composio + LiteLLM proxy.

```
/home/user/Crost/
├── frontend/                       Next.js app (the codebase)
│   ├── app/api/                    All HTTP endpoints (route.ts files)
│   ├── lib/                        Server-side libraries (llm-client, tools, supabase)
│   ├── components/                 React UI
│   ├── middleware.ts               Auth gate for /dashboard, /onboarding
│   └── types/index.ts              Central type registry
├── supabase/migrations/            DB schema (57 migrations, additive)
├── scripts/                        One-off TS/JS scripts (not deployed)
├── CROST_SPEC.md                   Product spec (source of truth, 79KB)
├── CROST_MASTER.md                 Engineering changelog (versioned v11.x)
├── CODEBASE_AUDIT_REPORT.md        Full audit (this handoff is its summary)
└── REMEDIATION_HANDOFF.md          ← you are here
```

**Key infrastructure facts:**
- Supabase service role key bypasses RLS — used in `createServerSupabaseClient()` (`frontend/lib/supabase.ts:14`)
- Auth client uses cookie-based SSR — `createSupabaseServerComponentClient()` (`frontend/lib/supabase.ts:34`)
- Internal cross-service auth uses header `x-crost-internal-secret` with value `SUPABASE_SERVICE_ROLE_KEY` (smell — see Issue #10)
- Composio = external tool gateway (Gmail, GitHub, Slack); slug overrides applied at `frontend/lib/tools/providers/composio.ts:13-22`
- HITL approval pattern: LLM emits `REQUEST_APPROVAL: {...}` block → parsed in `frontend/app/api/departments/[slug]/task/route.ts:46-93` and `frontend/lib/llm-client.ts:128`

---

## 2. THE 18 AUDIT FINDINGS — REMEDIATION QUEUE

Each row is **self-sufficient** for a fix-only agent. Use this as the work backlog.

### P0 — Critical Auth Gaps (DO FIRST, ~90 min total)

| # | File | Line | What's wrong | Fix pattern |
|---|------|------|--------------|-------------|
| ✅ 1a | `frontend/app/api/knowledge/search/route.ts` | 47-50 | `userId` from request body, zero auth | Replace with session `user.id`; allow body `userId` only when `x-crost-internal-secret` header is valid |
| ✅ 1b | `frontend/app/api/knowledge/read/route.ts` | 10-13 | Same as 1a | Same fix |
| ✅ 2 | `frontend/app/api/connect/route.ts` | 6-15 | `userId` from body, no auth at all | Add `auth.getUser()` gate; use `user.id` for `composio.create()` |
| ✅ 3 | `frontend/app/api/departments/[slug]/reset/route.ts` | 11 | No auth, no ownership check | Add `auth.getUser()`; add `.eq('created_by', user.id)` to dept select |
| ✅ 4 | `frontend/app/api/goals/[id]/report/route.ts` | 12-17 | Comment literally admits "We don't strictly auth gate this" | Add dual-mode: session auth + ownership OR internal secret header (mirror `worker/execute` pattern) |
| ✅ 5a | `frontend/app/api/settings/tools/route.ts` | 6-9 | No auth on tool config mutation | Add session auth; verify `tool.user_id === user.id` before update |
| ✅ 5b | `frontend/app/api/settings/tools/config/route.ts` | 6-9 | Same as 5a | Same fix |
| ✅ 6 | `frontend/app/api/config/secret-presence/route.ts` | 11-13 | Public endpoint leaks which API keys exist | Add session auth; scope query to `created_by=user.id` |
| ✅ 7 | `frontend/app/api/approvals/expire/route.ts` | 11-12 | `if (cronSecret)` — if env unset, auth is **skipped entirely** | Change to `if (!cronSecret) return 500`; always require the header |

**Fix template for #1, #2, #3, #5, #6 (paste-ready):**
```ts
import { createSupabaseServerComponentClient } from '@/lib/supabase'

export async function POST(req: NextRequest /*, { params }*/) {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  // ...existing logic, but replace any body-supplied userId with user.id
  // ...and add .eq('created_by', user.id) to ownership-sensitive queries
}
```

**Fix template for #4 (dual-mode auth, mirrors `worker/execute/route.ts:42-58`):**
```ts
const INTERNAL_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY  // TODO: rotate to WORKER_INTERNAL_SECRET (Issue #10)
const internalSecret = req.headers.get('x-crost-internal-secret')

let userId: string | null = null
if (internalSecret && INTERNAL_SECRET && internalSecret === INTERNAL_SECRET) {
  userId = bodyUserId ?? null  // trusted internal call
} else {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  userId = user.id

  // verify ownership of the resource
  const { data: resource } = await supabase.from('goals').select('id').eq('id', params.id).eq('created_by', user.id).maybeSingle()
  if (!resource) return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
```

### P1 — High Severity (after P0, ~135 min)

| # | File | Lines | Fix |
|---|------|-------|-----|
| ✅ 8 | `frontend/app/api/goals/[id]/dialogue/route.ts` | **53, 56, 81** (three update sites) | Add `.eq('created_by', user.id)` to every `.update().eq('id', goalId)` call |
| 9 | `frontend/lib/tools/execute-tool-call.ts` | KB result handling (~lines 113-127) | Always humanize KB search results to text before returning; never leak raw `{matches:[...]}` JSON to UI |
| ✅ 10 | All routes using `x-crost-internal-secret` | search: `grep -rn "x-crost-internal-secret" frontend/` | Replace `SUPABASE_SERVICE_ROLE_KEY` with new env var `WORKER_INTERNAL_SECRET`; rotate; update `.env.example`. Files affected: `worker/execute/route.ts`, `goals/[id]/dispatch/route.ts`, `approvals/[id]/route.ts`, `knowledge/search`, `knowledge/read`, `goals/[id]/report`, `goals/[id]/tasks/[taskId]` |
| 11 | `frontend/app/api/config/secret-presence/route.ts` | covered by #6 | — |
| 12 | `frontend/app/api/knowledge/search/route.ts` | 69-71 | `.or()` ILIKE pattern with user input — Supabase SDK escapes but verify; consider RPC-based search |

### P2 — Medium Severity (post-MVP, ~360 min)

| # | File | What |
|---|------|------|
| 13 | `frontend/app/api/departments/[slug]/task/route.ts:46-93` | Replace brace-counting `extractJsonObject` with zod-validated parser; cap nesting depth |
| 14 | `frontend/app/api/knowledge/upload/route.ts` | Add file size limit (50MB), MIME whitelist, per-user upload rate limit |
| 15 | `frontend/lib/artifact-transformers/index.ts` + callers | Surface transformer failures to event_log + memo; don't silently fall back |
| 16 | All API routes | Standardize response shape `{ success, data?, error?, code?, timestamp }` |
| 17 | All POST routes | Add `idempotency-key` header support; new table `idempotency_log` |
| 18 | `frontend/middleware.ts` or per-route | Add request body size limit (10MB) — return 413 |

### Out of Scope for This Audit (worth a follow-up pass)

- **CSRF protection** — none observed on state-changing POSTs. SameSite=Lax cookies provide partial defense but explicit token recommended.
- **CSP / security headers** — `next.config.js` does not set CSP/X-Frame-Options/HSTS.
- **RLS policy coverage** — schema has 57 migrations; not all tables verified to have RLS enabled. Run `SELECT relname FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND relkind='r' AND NOT relrowsecurity;` to find gaps.

---

## 3. WHAT IS ALREADY GOOD ON MAIN (don't break these)

So you know what NOT to "fix" — these are intentional and correct on `main`:

- **Dual-mode auth in `worker/execute/route.ts`** — session OR internal header. Pattern to replicate elsewhere.
- **JIT connection refresh** via `checkConnectionWithJIT(user.id, service)` before any Composio call (`frontend/lib/composio-connection.ts`)
- **Composio slug override map** at `frontend/lib/tools/providers/composio.ts:13-22` — handles canonical name mismatches (GMAIL_CREATE_DRAFT → GMAIL_CREATE_EMAIL_DRAFT etc.)
- **Department permission rules** at `frontend/lib/tools/execute-tool-call.ts:25-31` (`DEPARTMENT_TOOL_RULES`) — restricts which services each dept can call. Marketing ≠ Engineering.
- **Approval ownership query** uses `.or('created_by.eq.X,user_id.eq.X')` to handle legacy rows — keep this.
- **Dispatch dependency resolution** treats `completed | skipped | rejected` as satisfied (`goals/[id]/dispatch/route.ts:90-100`) — prevents deadlock; do not narrow.
- **Mission Report branding** logic in `WarRoom.tsx` switches between "Orc Assistant / Direct Response" and "Strategic Output / Mission Report" based on `[DIRECT RESPONSE]` prefix — this is the user-visible mode switch the original bug report complained about; logic is already in place but Orc's prompt may need tuning (see `ORCHESTRATOR_SYSTEM_NOTE` in `frontend/lib/llm-client.ts`).

---

## 4. ORIGINAL USER COMPLAINTS — MAPPING TO ROOT CAUSES

The user reported 5 surface bugs at the start of this session. Each maps to one or more audit findings:

| User complaint | Root cause | Audit ref |
|----------------|------------|-----------|
| Orc gives Mission Report for "What can you do?" | Orchestrator intent detection not firing direct-response path | Outside audit scope; check `ORCHESTRATOR_SYSTEM_NOTE` and `[DIRECT RESPONSE]` prefix logic in `llm-client.ts` |
| Gmail send_email rejects "no recipient" despite address provided | Tool param resolution drops `to` field somewhere between approval payload and Composio call | Check `frontend/app/api/approvals/[id]/route.ts` execution path + `COMPOSIO_SLUG_OVERRIDE_MAP` |
| `/knowledge_base_search` returns raw JSON | KB humanization bypassed when no matches | Issue #9 + `execute-tool-call.ts:114` |
| "Schedule social media post" generates Word doc design brief | Department can't escalate when no connector exists; falls back to drafting | Issue #15 (transformer silent fallback) + missing escalation path |
| "Write hello world HTML" → Mission Report + .md artifact | Same as #1; Orc treats trivial task as multi-step goal | Same as #1 |

**These 5 surface bugs are not in the audit's 18 findings** — they are product/prompt bugs, not security bugs. They need a separate prompt-engineering pass focused on:
- `ORCHESTRATOR_SYSTEM_NOTE` (intent classification)
- Engineering dept persona prompt
- Tool-missing escalation flow

---

## 5. ENVIRONMENT VARIABLES (current `.env.example` snapshot)

Required vars (verify in `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (drives cookie domain — must be set in prod)
- `COMPOSIO_API_KEY`
- `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY` (or `LITELLM_KEY`)
- `CLOUD_MODEL`, `CLOUD_MODEL_WORKER` (default groq llama-3.3-70b)
- `CRON_SECRET` (for `/api/approvals/expire`)

**New env vars to add as part of remediation:**
- `WORKER_INTERNAL_SECRET` (Issue #10, replaces use of SERVICE_ROLE_KEY as bearer)

---

## 6. HOW TO RESUME WORK (the reusable prompt)

When you start a new agent session, paste **the prompt block in Section 7** verbatim, then append your specific task (one of):

- `Implement P0 fixes 1a, 1b, 2, 3 from REMEDIATION_HANDOFF.md` (group small ones)
- `Implement P0 fix #4 (goals/[id]/report dual-mode auth) from REMEDIATION_HANDOFF.md`
- `Implement P1 fix #8 (dialogue race condition) from REMEDIATION_HANDOFF.md`
- `Add CSRF protection across all state-changing POST routes — full pass`
- `Audit RLS policy coverage on all public schema tables — return list of tables missing RLS`

**Rules of engagement for any agent:**
1. Do not re-audit. Trust `CODEBASE_AUDIT_REPORT.md` + this file.
2. Do not re-explore. File paths are given. Use `Read` directly.
3. Branch policy: work on `main` directly OR create a short-lived branch named `fix/<issue-number>-<slug>`, merge, delete.
4. Test with: `cd frontend && pnpm type-check && pnpm test:unit` (do not run full e2e — too slow for fix verification).
5. Commit per fix with message `fix(audit-#X): <one-line summary>`.
6. Update Section 2 of this file (REMEDIATION_HANDOFF.md) — change status to ✅ when fix is shipped.

---

## 7. PROMPT TEMPLATE (paste this into any new agent)

```
You are working on the Crost codebase at /home/user/Crost (Next.js 14 + Supabase + Composio).

CRITICAL CONTEXT: Read these two files FIRST and trust them as source of truth:
1. /home/user/Crost/REMEDIATION_HANDOFF.md  ← agent handoff bundle, read fully
2. /home/user/Crost/CODEBASE_AUDIT_REPORT.md ← full audit with code examples (1088 lines, use as reference)

DO NOT:
- Re-audit the codebase. 18 findings already documented in CODEBASE_AUDIT_REPORT.md.
- Re-explore the file tree. REMEDIATION_HANDOFF.md Section 1 has the map.
- Cherry-pick from other branches. They are stale/orphaned. main is the only source of truth.
- Rewrite tests unless the test broke from your change.

DO:
- Read the two files above first (one pass each).
- Implement the fix exactly as scoped by the user task below.
- Use the fix template in REMEDIATION_HANDOFF.md Section 2 when the issue is auth-related.
- Run `cd frontend && pnpm type-check` after edits to catch regressions.
- Commit per fix: `fix(audit-#X): <summary>` then push to main (or `fix/<#X>-slug` branch).
- Update REMEDIATION_HANDOFF.md Section 2 to mark the issue ✅ when done.

ENVIRONMENT FACTS YOU CAN ASSUME (don't verify):
- main is at HEAD 71f7de9 (post-audit merge). Other branches are stale.
- Auth pattern: createSupabaseServerComponentClient() → auth.getUser() → ownership check on resource
- Service-role pattern: createServerSupabaseClient() → bypasses RLS, use only after auth gate
- Internal-call pattern: x-crost-internal-secret header (currently uses SUPABASE_SERVICE_ROLE_KEY — see Issue #10)
- Test command: `cd frontend && pnpm type-check && pnpm test:unit`

YOUR TASK:
<<<INSERT SPECIFIC TASK HERE — e.g. "Implement P0 fixes #1a, #1b, #2, #3 from REMEDIATION_HANDOFF.md Section 2.">>>

When finished, give me a one-paragraph summary of what changed and a list of files touched. Do not write a long status report.
```

---

## 8. FILES YOU WILL NEED TO READ (avoid reading anything else upfront)

For P0 fixes (auth):
- `frontend/lib/supabase.ts` (already have createServerSupabaseClient + createSupabaseServerComponentClient — read once, reuse pattern)
- `frontend/app/api/worker/execute/route.ts` (lines 17, 42-90 — the canonical dual-mode auth pattern to copy)
- The 9 vulnerable files in Section 2's P0 table

For P1 fixes:
- `frontend/lib/tools/execute-tool-call.ts` (KB humanization area)
- `.env.example` (to add WORKER_INTERNAL_SECRET)

For P2 fixes:
- Per-issue reference in Section 2

**Average tokens per fix:** ~3-5k for P0 (read 1 file, edit 1 file, commit). Use Edit tool, not Write, on existing files.

---

## 9. ESCALATION SIGNALS

Stop and escalate to user (do not silently work around) if:
- A fix requires a DB migration (RLS changes, new columns) — user needs to apply via Supabase MCP
- Multiple tests fail after your fix and the failures look unrelated — likely indicates stale main or hidden regression
- An audit fix conflicts with `CROST_SPEC.md` — spec is product source of truth; raise the conflict, don't silently override
- You discover a NEW critical vulnerability not in the audit's 18 — add it to Section 2 as #19+ and tell user before fixing

---

## 10. SESSION HANDOFF NOTE

Original session that produced this audit & handoff: session_0159UUk6mBjQTvVJ4yQyVFFP

Branches in repo at handoff time (all stale except main):
- main (authoritative, has audit + handoff)
- 8 stale remote branches awaiting manual deletion (see Section 0)

Audit version: v1 (May 15, 2026). If you add findings, increment to v1.1, v1.2 etc.

— End of handoff —
