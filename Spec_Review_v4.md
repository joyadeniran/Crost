# Spec Review v4 — Current State vs CROST_SPEC.md v2.2
**Date**: April 24, 2026 · **Codebase version**: v11.17 · **Scope**: MVP DoD + open gaps

> This is the **authoritative current-state tracker**. Read this instead of the full spec for most tasks.
> Full spec needed only when the relevant §section is listed and the behaviour is ambiguous.

---

## MVP DoD Checklist (§17)

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Landing → app email pre-filled | ✅ | `app/signup/page.tsx` reads `?email` param |
| 2 | Email/password OTP blocks until verified | 🟠 | `middleware.ts` never checks `email_confirmed_at` |
| 3 | Onboarding < 4 minutes | ✅ | Flow exists; timing assumed OK |
| 4 | Orc introduced before dept selection | ✅ | `app/onboarding/orc/page.tsx` (v10.6) |
| 5 | First mission → real artefact via Skills layer | ✅ | `lib/skills/` + `loadSkillsForTask` (v11.9) |
| 6 | `skills_used` populated; `sources` non-empty | ✅ | v11.9 + v11.16 |
| 7 | Artefact previewable in-browser before download | 🟠 | Images only; PPTX/PDF/DOCX show "download to open" |
| 8 | Artefact card shows Sources footer | ✅ | `CitationsSection` in `ArtifactCard.tsx` (v11.16) |
| 9 | Gmail OAuth → email arrives | ✅ | Flow wired; depends on Composio connection |
| 10 | Mission Report in Memo/Inbox with Sources + Next Actions | ✅ | v11.13–v11.15 |
| 11 | Chip-tap end-to-end: 3 chips, HITL-aware, status updated | ✅ | v11.17 |
| 12 | BYOK replaces system key on next call | ✅ | `lib/llm-client.ts` key resolver |
| 13 | Free quota progress bar (green/amber/red, reset time, BYOK bypass) | ✅ | `components/settings/ApiKeysSettings.tsx` confirmed |
| 14 | KB search → `sources.kb_file_ids` populated on calling artefact | ✅ | v11.17 |
| 15 | App Store / Play Store placeholder | 🟢 | Post-MVP marketing task; not built |

---

## Open Gaps

### 🟠 HIGH — Fix before calling MVP done

#### H1. In-browser preview for non-image artefacts (§2 Beat 10, DoD #7)
- **What spec requires**: PDF.js for `.pdf`; first-page thumbnail stored as `preview_url` for PPTX/DOCX.
- **What exists**: `ArtifactCard.tsx` — images render inline; everything else shows "Native File Available — download to open." `preview_url` field exists in schema but is never populated for non-image types.
- **Fix**: At artifact creation in `lib/llm-client.ts` (`runWorkerTask`), generate a thumbnail/screenshot and upload to `artifacts` bucket as `preview_url`. For PDF, use PDF.js in the card component.
- **Files**: `lib/llm-client.ts` (populate `preview_url`), `components/artifacts/ArtifactCard.tsx` (PDF.js render path)

#### H2. Middleware doesn't block unverified email/password users (§11, DoD #2)
- **What spec requires**: Email/password users with unverified inboxes must see a blocking screen; cannot enter onboarding.
- **What exists**: `middleware.ts` routes based on `user_metadata.onboarding_step` but never checks `user.email_confirmed_at`. An email/password user with an active session but unverified email proceeds into onboarding.
- **Fix**: In `middleware.ts`, for users whose `app_metadata.provider === 'email'`, check `user.email_confirmed_at`. If null, redirect to `/verify-email` blocking page.
- **File**: `frontend/middleware.ts`

#### H3. Auth Bridge — duplicate email signup (§15.6, DoD #1 edge case)
- **What spec requires**: Duplicate email → redirect to `/login`, not a Supabase error toast.
- **What exists**: `app/signup/page.tsx` shows a generic error toast on `User already registered` Supabase error. No `user_consents` insert on `source=landing` signups.
- **Fix**: Catch Supabase `user_already_exists` error → `router.push('/login?email=...')`. On successful signup with `?source=landing`, insert a `user_consents` row.
- **File**: `frontend/app/signup/page.tsx`

---

### 🟡 MEDIUM — Spec violations, no immediate user breakage

#### M1. Memo writes still go to legacy `company_memos` table (§8)
- **What spec requires**: New writes prefer `company_memo` (singular, structured with `task_logs`, `decisions`, `strategies` JSONB columns). `company_memos` (plural) is for chat history only.
- **What exists**: `execute-tool-call.ts` and `llm-client.ts` write all task outputs, tool results, and Mission Reports to `company_memos`. `company_memo` is never written to from these paths.
- **Note**: This is a data hygiene issue; the Memo UI reads from `company_memos` so nothing is broken for users today. Defer until a dedicated Memo refactor session.
- **Files**: `lib/tools/execute-tool-call.ts`, `lib/llm-client.ts`

#### M2. App Store / Play Store placeholder (§18 Decision 4, DoD #15)
- Marketing task. Build "Crost Dispatch — Coming Soon" listings with email capture. Not a code task.

---

### 🟢 MINOR — Low priority, no functional impact

| # | Gap | File | Quick fix |
|---|---|---|---|
| G1 | `user_consents` table never referenced in code | `app/signup/page.tsx` | Insert row on landing signup (part of H3) |
| G2 | `selectModel()` uses role-based routing not task-type (§15.3) | `lib/llm-client.ts` | Cosmetic mismatch; functional |
| G3 | Signup CTA "Initialize Crost →" feels jargon-y (§2 Beat 2) | `app/signup/page.tsx` | Change to "Start Free →" |

---

## Fully Resolved (since Spec_Review_v2)

| Item | Resolved in | What was built |
|---|---|---|
| §6.1 Suggested Next Actions — entirely absent | v11.11–v11.17 | Full SuggestedAction schema, chip execution, HITL routing, inline input panel |
| §9.5 Skills Layer — entirely absent | v11.9 | 5 SKILL.md files, `loadSkillsForTask`, prompt injection |
| §9 Artefact citations (`sources`) | v11.16 | `ArtifactSources` type, DB column, GIN index, `CitationsSection` UI |
| §7 Mission Reports — partial/broken | v11.13–v11.15 | Canonical naming, `goal_mission_report_written` event, dedup fix |
| §11 Risk mode not wired to executeToolCall | v11.17 | `RISK_MODE_AUTO` map, reads `system_config.risk_tolerance` |
| §9 `artifact_type` enum missing presentation/pdf | v11.9 | Added to TypeScript union + Zod schema |
| §2 Beat 8 Processing copy not implemented | v11.17 | `PROCESSING_MESSAGES` constant, `useProcessingMessage` hook |
| KB search never writes `kb_file_ids` to artefact | v11.17 | `writeKbSourcesToArtifact()` called after each search path |
| Suggested action payloads empty | v11.17 | Meaningful payload + `required_inputs` per slug |
| §16 ChatCommandMenu shows draft departments | v11.17 | Filter to `activation_stage === 'active'` only |
| §11 Task stuck running / silent hangs | v11.12 | 8 bugs fixed across goal/task/approval pipeline |
| Free tier progress bar (DoD #13) | pre-v11 | Confirmed ✅ in `ApiKeysSettings.tsx` |

---

## Where to look for anything not listed here

Use the knowledge graph first:
```
semantic_search_nodes("keyword")          → find any function/component
query_graph(pattern="callers_of", ...)    → trace who calls what
get_impact_radius(file, function)         → blast radius of a change
detect_changes()                          → risk-scored diff analysis
```
Fall back to Grep/Read only when the graph doesn't return what you need.
