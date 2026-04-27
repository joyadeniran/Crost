# Spec Review v5 — Current State vs CROST_SPEC.md v2.2
**Date**: April 27, 2026 · **Codebase version**: v11.30 · **Scope**: Post-DoD Audit + Operational Gaps

> This is the **new authoritative current-state tracker**. It supersedes `Spec_Review_v4.md` and includes the "Artefacts Gallery v1" changes from April 25.

---

## MVP DoD Checklist (Final Polish)

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Landing → app email pre-filled | ✅ | `app/signup/page.tsx` pre-fills from `?email` |
| 2 | Email/password OTP blocks until verified | ✅ | **Fixed**: `middleware.ts` redirects to `/verify-email`. |
| 3 | Onboarding < 4 minutes | ✅ | Verified flow and timing. |
| 4 | Orc introduced before dept selection | ✅ | `app/onboarding/orc/page.tsx` exists. |
| 5 | First mission → real artefact via Skills layer | ✅ | `lib/skills/` integrated. |
| 6 | `skills_used` populated; `sources` non-empty | ✅ | Verified in `artifacts` table. |
| 7 | Artefact previewable in-browser before download | ✅ | **Fixed**: Native iframe scaling for PDF/Office grid thumbs. |
| 8 | Artefact card shows Sources footer | ✅ | `CitationsSection` in `ArtifactCard.tsx`. |
| 9 | Gmail OAuth → email arrives | ✅ | End-to-end via Composio. |
| 10 | Mission Report in Memo/Inbox with Sources + Next Actions | ✅ | Verified after task completion. |
| 11 | Chip-tap end-to-end: 3 chips, HITL-aware, status updated | ✅ | Full state machine in `SuggestedActionChips.tsx`. |
| 12 | BYOK replaces system key on next call | ✅ | Key resolver confirmed. |
| 13 | Free quota progress bar (green/amber/red, reset time, BYOK bypass) | ✅ | Confirmed in `ApiKeysSettings.tsx`. |
| 14 | KB search → `sources.kb_file_ids` populated on calling artefact | ✅ | Verified in `api/knowledge/search`. |
| 15 | Lineage tracking (Goal → Task → Artefact) | ✅ | **NEW**: `task_id` added to `artifacts` on April 25. |

---

## Open Gaps (v5.0)

### 🔴 HIGH — Priority Fixes

#### H1. Non-image artifact thumbnails (§2 Beat 10, DoD #7)
- **Status**: ✅ Resolved. `ArtifactCard.tsx` now uses scaled-down native `iframe` renders (via PDF browser viewer and Office Online embed) directly in the thumbnail area when `preview_url` is absent.

#### H2. Auth Middleware Security Gap (§11, DoD #2)
- **Status**: ✅ Resolved. Unverified email/password users are now intercepted in `middleware.ts` and redirected to a dedicated `/verify-email` blocking page.

#### H3. Auth Bridge Edge Case (§15.6)
- **Status**: ✅ Resolved. Duplicate email signups correctly catch the `user_already_exists` error and redirect the founder to `/login?email=...` with a toast notification.

---

### 🟡 MEDIUM — Architectural & Data Hygiene

#### M1. Migration to Singular `company_memo` table (§8)
- **Status**: Partially Resolved. The singular table exists, but `execute-tool-call.ts` and `llm-client.ts` still write primarily to the legacy `company_memos` table.
- **Action**: Refactor `logDecision`, `logTask`, and `writeMissionReport` to write to the structured JSONB columns in `company_memo`.

#### M2. Lineage Tab in Artefacts Drawer (§15.8)
- **Status**: New. The schema now supports `task_id`, but the UI doesn't yet show the "Lineage" tab to trace the artifact back to its parent task/goal logic.
- **Action**: Add a "Lineage" tab to `ArtifactCard.tsx` drawer using the `task_id` reference.

---

## Post-April 25 Wins (v11.28–v11.29)
- **Artefacts Gallery v1**: Transitioned from a list to a rich grid with `file_size` and `task_id`.
- **Badge Count Sync**: Fixed real-time mismatch between sidebar count and grid.
- **Real-time Optimisation**: Eliminated redundant REST polls for the approval queue.

---
*Created by Gemini CLI — April 27, 2026*
