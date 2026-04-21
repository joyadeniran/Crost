# Crost v2.2 Spec → Codebase Compliance Review

> **Generated:** April 21, 2026  
> **Spec reviewed:** `CROST_SPEC.md` (v2.2, last updated April 20, 2026)  
> **Method:** code-review-graph architecture analysis + targeted file search  
> **Reviewer:** Claude Code (claude-sonnet-4-6)

---

## Architecture Snapshot

**Graph stats:** 29 communities · 244 cross-community edges · 180 files · TypeScript/TSX/JS

| Community | Size | Cohesion | Directory |
|---|---|---|---|
| `task-post` | 95 | 0.009 | `frontend/app/api` |
| `lib-department` | 68 | 0.092 | `frontend/lib` |
| `scripts-check` | 54 | 0.115 | `scripts` |
| `knowledge-page` | 46 | 0.016 | `frontend/app/dashboard` |
| `departments-handle` | 39 | 0.037 | `frontend/components/departments` |
| `artifact-transformers-transform` | 33 | **0.435** | `frontend/lib/artifact-transformers` |
| `settings-handle` | 29 | 0.045 | `frontend/components/settings` |
| `war-room-handle` | 29 | 0.075 | `frontend/components/war-room` |
| `identity-handle` | 24 | 0.021 | `frontend/app/onboarding` |
| `artifacts-artifact` | 12 | 0.106 | `frontend/components/artifacts` |

### Structural Risk Flag

> **High coupling: `task-post` ↔ `lib-department` — 136 cross-community edges.**

This is the graph's top warning. Nearly every API route depends on `lib-department` (utils, key-resolver, llm-client, execute-tool-call). Changes to any shared lib file have a blast radius into all API routes. Not a spec violation — it's the expected hub-and-spoke pattern — but treat `frontend/lib` as a **refactor-carefully zone**. Run `get_impact_radius` before touching any file there.

Secondary warnings:
- `knowledge-page` ↔ `lib-department`: 22 edges
- `identity-handle` ↔ `onboarding-card`: 11 edges

---

## Compliance Status by Spec Section

### Legend
- ✅ Implemented — matches spec
- ⚠️ Partial — exists but gaps remain
- ❌ Missing — not built

---

### §2 — First 10 Minutes (Onboarding)

#### Beat 2 — Auth (OTP gate)
**Status: ✅ Implemented**  
Email/password OTP gate and OAuth bypass are implemented. Verification rule matches §11 table.

#### Beat 6 — "Meet Orc" screen
**Status: ❌ Missing**

Current onboarding routes:
```
/onboarding/identity  → /onboarding/control → /onboarding/team → /onboarding/activate
```

The spec requires a full-screen "Meet Orc — your AI Chief of Staff" moment **before department selection** (`/onboarding/team`). No such route exists. This is **DoD #4**.

**Required:** New route `/onboarding/orc` (or equivalent) with:
- Full-screen Orc introduction
- Copy: *"Meet Orc — your AI Chief of Staff. Orc plans your work, coordinates departments, and helps you run your company."*
- Small Orc visual mark (`Crost-icon256.png`)
- Inserted between `/onboarding/control` and `/onboarding/team`

#### Beat 8 — Processing copy (canonical list)
**Status: ❌ Missing**

Only one processing string found in the codebase:
```
frontend/app/onboarding/activate/page.tsx:201 — "Preparing your first approvals"
```

The full canonical list from §2 Beat 8 is not implemented. The weapons-language ban is not enforced in code.

**Required:** A constants file (e.g. `lib/processing-copy.ts`) exporting the canonical list:

Office-themed: *Preparing your first mission · Drawing strategy · Coordinating departments · Drafting artefacts · Reviewing company context · Building your war room · Briefing the team · Reading the room · Connecting the dots · Sketching the plan · Aligning departments · Pulling references*

Warm-playful (sparingly): *Putting on the boots · Sharpening the pencils · Clearing the desk · Pinning the notes · Warming up the team · Pouring the coffee*

**Forbidden (do not use):** anything involving weapons, combat, violence, aggression.

---

### §6.1 — Suggested Next Actions *(entire v2.2 addition)*
**Status: ❌ Not built**

This is the largest single gap. The word `suggested_action` appears exactly once in the codebase — as a hallucination warning comment in the worker route. Nothing from §6.1 is implemented.

**Missing pieces:**

1. **`SuggestedAction` type** — not in `types/index.ts`
2. **`suggested_actions` DB table** — schema not wired
3. **`suggested_actions: UUID[]` column on `artifacts`** — column exists in spec §9 schema but not populated
4. **`executeSuggestedAction(suggestedActionId, userId)`** — function does not exist in `lib/tools/execute-tool-call.ts`
5. **Chip UI on `ArtifactCard.tsx`** — no `action_slug` rendering, no chip buttons
6. **"What next?" section on Mission Reports** — no Mission Report component at all (see §7)
7. **Dashboard "What next?" widget** — not built

**DoD #11 will fail entirely:**
> *"Tapping `send_to_email` executes through the gateway, surfaces the HITL approval (or auto-executes per Risk Mode), succeeds, and updates the SuggestedAction row to `status = "completed"`."*

**Canonical action catalog to implement (MVP):**

| `action_slug` | Label | Required tool | Risk | Handler |
|---|---|---|---|---|
| `send_to_email` | Send to my email | Gmail | medium | Orc (executive) |
| `send_to_contact` | Send to someone else | Gmail | medium | Orc (executive) |
| `save_to_kb` | Save to Knowledge Base | — | low | Orc (executive) |
| `make_changes` | Make changes | — | low | Originating dept |
| `schedule_recurring` | Run this every [interval] | — | low | Orc (executive) |
| `add_to_memo` | Save as a decision in the Memo | — | low | Orc (executive) |
| `generate_companion` | Generate a companion artefact | — | medium | Relevant dept |
| `share_with_teammate` | Share with a teammate | Gmail/Slack | medium | Orc (executive) |
| `draft_followup` | Draft a follow-up message | — | low | Relevant dept |
| `start_new_mission` | Start a related mission | — | low | Orc (executive) |

**Surfacing locations (all four required):**
1. War Room completion message — 2–3 chips inline (3-chip cap)
2. Artefact card — persistent chips below preview
3. Mission Report — "What next?" section
4. Dashboard widget — top 3 unresolved across all recent missions

---

### §7 — Mission Reports
**Status: ❌ Skeleton only**

`goal_mission_report_written` event type exists in `types/index.ts` (noted as "legacy"). No Mission Report component, no Sources section, no Suggested Next Actions section on reports.

**Missing:**
- Mission Report UI component (accessible from Memo, artefact detail, Inbox)
- Auto-written on completion (success, failure, partial)
- Required sections: mission objective, departments involved, outputs, approvals, Sources, Suggested Next Actions
- Event emission: `goal_mission_report_written`

---

### §9 — Artefacts

#### Schema fields
**Status: ⚠️ Partial**

Fields present in `types/index.ts` and API routes: `file_url`, `preview_url`, `skills_used`, `sources` (with `memo_ids`, `kb_file_ids`). DB structure is correct.

**Missing:** `suggested_actions: UUID[]` column linking to `suggested_actions` table (§6.1 addition).

#### Citations / Sources footer
**Status: ❌ Missing**

`sources.memo_ids` and `sources.kb_file_ids` are populated in the DB schema and referenced in `frontend/app/api/artifacts/route.ts`, but `ArtifactCard.tsx` renders **no Sources footer**. The spec requires:
- "Sources" footer on the artefact card listing Memo entries and KB files
- Inside the file itself where format permits (DOCX footnote section, PPTX final slide)

**DoD #8 will fail:** *"Artefact card shows a Sources footer listing Memo entries and KB files used."*

#### In-browser preview
**Status: ⚠️ Partial**

- Images: ✅ — `preview_url` rendered via `<Image>` in `ArtifactCard.tsx:485`
- Non-images: ⚠️ — Shows text content preview + "Native File Available" notice. This is **not** a true in-browser preview.
- PPTX / DOCX: ❌ — Download-only. No embedded viewer, no first-page thumbnail.

**DoD #7:** *"Artefact must be previewable in-browser before download."* Currently partially met.

**Recommended fix:** For PDF — `<iframe src={file_url}>` or PDF.js. For PPTX/DOCX — generate a thumbnail on upload and surface it via `preview_url`.

---

### §9.5 — Skills Layer *(5 starter skills)*
**Status: ❌ Not built**

`frontend/lib/skills/` directory does not exist. No `SKILL.md` files. `skills_used` field exists in DB types and is referenced in artifact API routes but **nothing populates it** — no Skill Loader in the execution pipeline.

**Missing:**
- `frontend/lib/skills/pptx/SKILL.md`
- `frontend/lib/skills/docx/SKILL.md`
- `frontend/lib/skills/xlsx/SKILL.md`
- `frontend/lib/skills/pdf/SKILL.md`
- `frontend/lib/skills/pitch_deck/SKILL.md`
- Skill Loader integration into `frontend/app/api/departments/[slug]/task/route.ts` (load skill into dept prompt before LLM call)
- `skills_registry` table population

**DoD #5 will fail:** *"Suggested first mission produces a real artefact via the Skills layer."*  
**DoD #6 will fail:** *"Artefact has `skills_used` populated and a non-empty `sources` field."*

Note: `artifact-transformers-transform` community has the highest cohesion in the codebase (0.435) — a strong foundation to build the Skills layer on top of.

---

### §10 — Knowledge Base
**Status: ✅ Implemented (MVP scope)**

- `lib/knowledge/extract-text.ts` — pdf-parse, mammoth, xlsx, native UTF-8
- Upload API routes present
- `knowledge_base_search` tool registered
- `knowledge_base_files` and `knowledge_base_chunks` tables referenced
- RLS per-user enforcement present

MVP scope correctly excludes Vision fallback, chunking, and pgvector. Matches spec §17.

**Gap:** Calling artefact's `sources.kb_file_ids` must be populated when KB search is used. Verify this write-back happens in `executeToolCall` → `knowledge_base_search` path. DoD #14 requires it.

---

### §11 — Inbox & Approvals (HITL)
**Status: ✅ Implemented**

- `REQUEST_APPROVAL` block parsing in `frontend/app/api/departments/[slug]/task/route.ts`
- `approval_queue` insert/read API routes: `/api/approvals/route.ts`, `/api/approvals/[id]/route.ts`, `/api/approvals/expire/route.ts`
- `RealtimeProvider.tsx` — real-time subscription drives `pendingApprovalCount`
- `NotificationDropdown.tsx` — bell badge with pending count
- `LayoutStoreHydrator.tsx` — Zustand hydration

**Gap (from §6.1):** Chip taps from Suggested Next Actions must also flow through this same `approval_queue`. Since §6.1 is unbuilt, this is a pending wiring task — not a regression.

---

### §12 — Tool Connections (Composio)
**Status: ✅ Implemented**

- `lib/tools/execute-tool-call.ts::executeToolCall` — gateway present, called from `/api/tools/invoke` and `/api/worker/execute`
- Internal handler branch (for `knowledge_base_search`) and Composio branch both present
- Returns correct outcome shapes: `{ success, result }`, `{ requires_approval, approval_id }`, `{ missing_connection, service }`, `{ error }`

**Gap (from §15.7):** `executeSuggestedAction()` entry point not yet added to the gateway. Required for §6.1.

---

### §15.3 — Model Routing
**Status: ✅ Implemented**

`frontend/lib/model-routing.ts` exists. Three-tier routing (planning → HIGH_REASONING, execution → FAST, formatting → ULTRA_FAST) implemented.

---

### §15.4 — BYOK
**Status: ✅ Implemented**

- `frontend/lib/key-resolver.ts` — key resolution logic present
- `frontend/components/settings/ApiKeysSettings.tsx` — stores and validates keys → `user_api_keys`
- `frontend/components/settings/ModelAssignmentForm.tsx` — assigns models → `user_model_assignments`
- Concern separation is correct (two separate components, two separate DB writes)
- `lib/llm-client.ts` — LiteLLM integration

**Verify:** Deprecated slugs `'claude'` and `'google'` should be rejected; only `'anthropic'` and `'gemini'` accepted. Confirm key-resolver enforces this.

---

### §15.5 — Free Tier & Usage Limits
**Status: ✅ Implemented**

- `/api/usage/today/route.ts` — daily quota endpoint
- `lib/cost-table.ts` — static pricing table
- Settings UI usage bar — real progress bar referenced

---

### §16 — Interaction Modes (@dept, /tool, plain Orc)
**Status: ✅ Implemented**

- `components/chat/ChatCommandMenu.tsx` — `@` and `/` autocomplete menu (v10.5 icon fix applied)
- `components/departments/DepartmentCard.tsx` — centralized `resolveIcon()` (v10.5)
- `lib/utils.ts` — `ICON_MAP` + `resolveIcon()` utility
- `/api/tools/invoke` — `/tool` routing
- `/api/departments/[slug]/task` — `@dept` routing
- `CommandThread` rendering referenced in `WarRoom.tsx`

---

## Priority Action List

### P0 — DoD Blockers (nothing ships without these)

| # | Gap | DoD gates | Estimated effort |
|---|---|---|---|
| 1 | **§6.1 Suggested Next Actions** — full `SuggestedAction` schema, `executeSuggestedAction()`, chip UI on artefact card, Mission Report section, dashboard widget | DoD #10, #11 | Large (5–8 days) |
| 2 | **§9.5 Skills Layer** — create `frontend/lib/skills/` with 5 `SKILL.md` files + Skill Loader integration in dept task route | DoD #5, #6 | Medium (3–5 days) |
| 3 | **§2 Beat 6 "Meet Orc" screen** — new onboarding route inserted before `/onboarding/team` | DoD #4 | Small (1 day) |

### P1 — Trust & Quality

| # | Gap | DoD gates |
|---|---|---|
| 4 | **§9 Sources footer on ArtifactCard** — surface `sources.memo_ids` and `sources.kb_file_ids` in the card UI | DoD #8 |
| 5 | **§7 Mission Report component** — full UI with Sources + Suggested Next Actions sections | DoD #10 |
| 6 | **§9 In-browser preview (non-images)** — iframe for PDF, thumbnail for PPTX/DOCX | DoD #7 |

### P2 — Polish

| # | Gap |
|---|---|
| 7 | **§2 Beat 8 Processing copy** — create `lib/processing-copy.ts` constants file with canonical list; pull it into all loading states |
| 8 | **§15.4 BYOK slug validation** — confirm deprecated `'claude'`/`'google'` slugs are rejected by key-resolver |
| 9 | **§10 KB search write-back** — confirm `sources.kb_file_ids` is populated on calling artefact when `knowledge_base_search` runs |

---

## What's Solid (Do Not Regress)

- **HITL / Approval queue** — correctly implemented end-to-end
- **executeToolCall gateway** — correct outcome shapes, correct routing
- **BYOK + key-resolver** — concern separation matches spec exactly
- **Model routing (3-tier)** — present
- **Knowledge Base extraction** — MVP scope correctly implemented
- **Interaction modes (@dept, /tool)** — working, v10.5 icon fix live
- **Free tier / usage bar** — implemented
- **`artifact-transformers-transform`** — highest cohesion community (0.435); solid foundation for Skills layer

---

## Definition of Done Scorecard

| # | DoD Criterion | Pass? |
|---|---|---|
| 1 | Landing → app email pre-filled | Not verified (separate deployment) |
| 2 | Email/password blocks at OTP; OAuth proceeds straight through | ✅ |
| 3 | Onboarding completes in under 4 minutes | ✅ (4 screens) |
| 4 | Orc is introduced before department selection | ❌ No "Meet Orc" screen |
| 5 | Suggested first mission via Skills layer | ❌ Skills not built |
| 6 | Artefact has `skills_used` populated and non-empty `sources` | ❌ Nothing populates `skills_used` |
| 7 | Artefact is previewable in-browser before download | ⚠️ Images only |
| 8 | Artefact card shows Sources footer | ❌ No Sources footer in ArtifactCard |
| 9 | Gmail OAuth completes in ≤2 clicks; email arrives | Not verified (Composio wiring) |
| 10 | Mission Report in Memo and Inbox with Sources + Suggested Next Actions | ❌ No Mission Report component |
| 11 | Chip-tap end-to-end: artefact card → gateway → HITL → `status = "completed"` | ❌ Chips not built |
| 12 | BYOK key replaces system-key on next call | ✅ |
| 13 | Free quota progress bar reflects real usage | ✅ |
| 14 | KB upload + search returns chunk; `sources.kb_file_ids` populated | ⚠️ Upload works; write-back unverified |
| 15 | App Store / Play Store placeholder captures email | Not verified |

**Score: 4 confirmed ✅ · 3 partial ⚠️ · 6 failing ❌ · 2 not verified**

---

*End of review. When this document and the spec disagree, the spec (`CROST_SPEC.md`) wins. When either disagrees with shipped reality, raise it in `CROST_MASTER.md`.*
