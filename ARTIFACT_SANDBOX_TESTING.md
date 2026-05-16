# Artifact Sandbox Lifecycle — Testing & Validation

## Overview

This document defines the test plan for the artifact sandbox approval system (Phase 1–3 complete). It covers the full lifecycle from creation through publication, make changes workflow, and edge cases.

## Test Environment Setup

- **Branch**: `claude/artifact-approval-sandbox-4dSCU`
- **Database**: Fresh branch DB with all migrations applied (20260516000001–20260516000004)
- **Frontend**: `npm run dev` at localhost:3000
- **Auth**: Test user with verified email

## Section 1: Artifact Creation & Draft State (Phase 2 Validator)

### Test 1.1 — Artifact lands in draft on creation

**Steps:**
1. Create a new goal: "Write a sample pitch deck"
2. Dispatch to Marketing department
3. Department generates a PPTX artifact
4. Verify artifact appears in database with `status='draft'`, `version=1`

**Expected:**
- Artifact row exists: `id`, `goal_id`, `department_slug`, `status='draft'`, `version=1`, `body=null`, `file_url=<valid storage URL>`
- Event log entry: `event_type='artifact_created'`
- Suggested actions generated with `execution_path` correctly set

**Validation query:**
```sql
SELECT id, status, version, published_at, approved_by FROM artifacts WHERE id='<artifact_id>';
-- Expected: draft | 1 | NULL | NULL
```

### Test 1.2 — Draft artifacts hidden from Gallery tab

**Steps:**
1. Navigate to `/dashboard/artifacts`
2. Verify Gallery tab shows NO draft artifacts (only review/active/paused/deprecated)
3. Switch to Sandbox tab
4. Verify draft artifact appears with amber "In Sandbox" badge

**Expected:**
- Gallery shows 0 draft artifacts
- Sandbox shows 1 draft with badge
- Artifact card has no "Approve & Publish" or "Make Changes" button in menu

### Test 1.3 — Draft artifacts are editable

**Steps:**
1. Click the draft artifact in Sandbox tab
2. Open the detail drawer
3. Try to edit the title via PATCH `/api/artifacts/[id]`
4. Verify title updates successfully with `version` incremented to 2

**Expected:**
- PATCH returns 200 OK
- version = 2
- updated_at timestamp reflects the change
- No immutability error

## Section 2: Sandbox to Review Transition (Phase 3 Validator)

### Test 2.1 — Submit for Review

**Steps:**
1. In Sandbox tab, click draft artifact menu (⋯)
2. Click "Submit for Review"
3. Verify artifact status transitions to `review`

**Expected:**
- Status changes to `review`
- Badge changes to blue "In Review"
- Version remains at current value (e.g., 2 if edited)
- Event log: `event_type='artifact_activated'` or status change event

### Test 2.2 — Review artifacts visible in Gallery tab

**Steps:**
1. Switch to Gallery tab
2. Verify the review artifact appears with blue "In Review" badge
3. Verify it can still be edited if needed

**Expected:**
- Review artifact visible in Gallery tab
- Can click to open drawer
- Menu shows "Approve & Publish" + "Make Changes" + "Discard" options

### Test 2.3 — Version bumps during review edits

**Steps:**
1. Edit review artifact title again
2. Verify version increments (e.g., 2 → 3)
3. Submit for Review again (transition to active)

**Expected:**
- PATCH succeeds with version increment
- Final version locked when moving to active

## Section 3: Review to Active Transition (Phase 3 Validator)

### Test 3.1 — Approve & Publish

**Steps:**
1. In Gallery tab, find review artifact
2. Click menu (⋯)
3. Click "Approve & Publish"
4. Verify status transitions to `active`

**Expected:**
- Status = `active`
- `published_at` timestamp is set (non-null)
- `approved_by` = logged-in user's UUID
- Badge changes to green "Published"
- Version is locked (immutable)

**Validation query:**
```sql
SELECT status, version, published_at, approved_by FROM artifacts WHERE id='<artifact_id>';
-- Expected: active | 3 (or final version) | 2026-05-16T... | <user_uuid>
```

### Test 3.2 — Active artifacts are immutable via API

**Steps:**
1. Fetch the active artifact details
2. Try PATCH with title change
3. Verify API rejects with 409 Conflict

**Expected:**
- Response: 409 Conflict
- Error message: "Artifact is active and immutable. Use 'Make changes' to create a new version."
- code: `ARTIFACT_IMMUTABLE`
- Artifact row unchanged

**Validation:**
```bash
curl -X PATCH /api/artifacts/<id> \
  -H "Content-Type: application/json" \
  -d '{"title":"New Title"}'
# Expected: 409 Conflict, error code ARTIFACT_IMMUTABLE
```

### Test 3.3 — Database trigger enforces immutability

**Steps:**
1. Try to directly UPDATE via SQL: `UPDATE artifacts SET title='Hack' WHERE id='<id>' AND status='active'`
2. Verify the trigger rejects the update

**Expected:**
- Update fails with error from `enforce_artifact_status_transition()` trigger
- Artifact remains unchanged

## Section 4: Make Changes Workflow (Phase 1 Implementation Validator)

### Test 4.1 — Make Changes button appears for review artifacts

**Steps:**
1. In Gallery tab, find a review artifact
2. Click menu (⋯)
3. Verify "Make Changes" button is visible
4. (Do NOT click yet — validate UI presence first)

**Expected:**
- Button is present and clickable
- Icon shows edit/pencil symbol
- Text: "Make Changes"

### Test 4.2 — Make Changes creates a new task

**Steps:**
1. Click "Make Changes" on the review artifact
2. Confirm toast notification: "Revision task created and queued for execution"
3. Navigate to the goal
4. Verify a new task appears in the goal's task list

**Expected:**
- New goal_task created with:
  - `label = "Revise: [original artifact title]"`
  - `dept_slug = <original artifact's department>`
  - `status = 'pending'`
  - params include `revising_artifact_id = <original artifact id>`
- Suggested action created for dispatching the new task
- Event log: `event_type='artifact_revision_requested'` with metadata

**Validation query:**
```sql
SELECT id, task_id, label, status, params->>'revising_artifact_id' as revising FROM goal_tasks 
WHERE goal_id='<goal_id>' AND label LIKE 'Revise:%';
```

### Test 4.3 — Dispatch the revision task

**Steps:**
1. Navigate to the goal containing the revision task
2. Click "Dispatch" on the "Revise: [title]" task
3. Department executes and generates a new artifact

**Expected:**
- Task transitions to `status='running'` then `'completed'`
- New artifact created in `draft` status
- New artifact has same `goal_id` as the original
- Event log shows completion

### Test 4.4 — New artifact can be reviewed and approved separately

**Steps:**
1. Navigate to Sandbox tab
2. Verify new artifact appears (created by the revision task)
3. Submit for Review
4. Approve & Publish
5. Verify new artifact is now `active`

**Expected:**
- New artifact follows the full sandbox → review → active lifecycle independently
- Original artifact remains in its prior state (review or active)
- Both artifacts visible in the Gallery with separate status badges
- Lineage discoverable via goal_id and task metadata

## Section 5: Make Changes on Active Artifacts

### Test 5.1 — Make Changes button appears for active artifacts

**Steps:**
1. Find an `active` artifact in Gallery
2. Click menu (⋯)
3. Verify lock icon + "Immutable — use Make Changes" message
4. Verify "Make Changes" button appears below the lock message
5. Verify "Archive" button is present

**Expected:**
- Lock message visible and styled appropriately
- "Make Changes" button is clickable
- "Archive" button present for deprecation

### Test 5.2 — Make Changes on active artifact works identically to review

**Steps:**
1. Click "Make Changes" on active artifact
2. Navigate to goal
3. Verify revision task created
4. Dispatch task
5. Complete the revision flow

**Expected:**
- Identical behavior to Test 4.2–4.4
- Original active artifact unaffected
- New revision lands in draft
- Full lifecycle repeated

## Section 6: Discard Workflow (Phase 3 Validator)

### Test 6.1 — Discard from draft/review

**Steps:**
1. Create a draft artifact
2. Click menu (⋯)
3. Verify "Discard" button visible
4. Click "Discard"
5. Confirm in modal: "Yes, Discard"

**Expected:**
- Artifact transitions to `status='discarded'`
- Removed from both Gallery and Sandbox tabs
- Event log: discard event
- Hard delete NOT performed (audit trail preserved)

**Validation query:**
```sql
SELECT status FROM artifacts WHERE id='<id>';
-- Expected: discarded
```

### Test 6.2 — Cannot discard active/paused/deprecated

**Steps:**
1. Find an `active` artifact
2. Click menu (⋯)
3. Verify "Discard" button is NOT present
4. Try API DELETE `/api/artifacts/<id>`

**Expected:**
- Discard button absent from menu
- API DELETE returns 409 Conflict
- Error message: "Cannot discard a published artifact. Use deprecated to archive it."
- Artifact unchanged

## Section 7: Archive/Deprecate Workflow (Phase 3 Validator)

### Test 7.1 — Archive active artifact

**Steps:**
1. Find an `active` artifact
2. Click menu (⋯)
3. Click "Archive"
4. Verify status transitions to `deprecated`

**Expected:**
- Status = `deprecated`
- Badge changes to gray "Archived"
- Removed from active Gallery view (but remains in historical records)
- Can still be viewed if directly navigated

### Test 7.2 — Paused artifacts can be archived or revised

**Steps:**
1. Find/create a `paused` artifact
2. Verify menu shows both "Make Changes" and "Archive"
3. Click each to verify both work

**Expected:**
- Both buttons functional
- "Make Changes" creates revision task
- "Archive" transitions to deprecated

## Section 8: Status Transition Rules (Phase 1 Validator)

### Test 8.1 — Invalid transitions are rejected

**Steps:**
1. Try PATCH `draft` artifact with `status='active'` (should require review first)
2. Try PATCH `review` artifact with `status='deprecated'` (should only allow discard)
3. Try PATCH `discarded` artifact back to `draft`

**Expected:**
- All return 422 Unprocessable Entity
- Error messages explain the invalid transition
- code: `INVALID_STATUS_TRANSITION`

**Validation:**
```bash
# Test: draft → active (skip review)
curl -X PATCH /api/artifacts/<draft_id> \
  -d '{"status":"active"}'
# Expected: 422, INVALID_STATUS_TRANSITION

# Test: review → deprecated (should use discard)
curl -X PATCH /api/artifacts/<review_id> \
  -d '{"status":"deprecated"}'
# Expected: 422, INVALID_STATUS_TRANSITION
```

## Section 9: Suggested Actions Routing (Phase 2 Validator)

### Test 9.1 — make_changes action has correct execution_path

**Steps:**
1. Create an artifact and generate suggested actions
2. Query suggested_actions table
3. Verify `make_changes` has `execution_path='internal'`

**Expected:**
```sql
SELECT action_slug, execution_path FROM suggested_actions 
WHERE source_entity_type='artifact' AND action_slug='make_changes';
-- Expected: make_changes | internal
```

### Test 9.2 — make_changes action tapped from Sandbox

**Steps:**
1. Open artifact card with suggested action chips
2. Click "Make changes" chip
3. Verify it routes to `/api/artifacts/<id>/make-changes`

**Expected:**
- No toast about "missing connection" or approval required
- Toast: "Revision task created..."
- Suggested action status transitions to `completed`

## Section 10: Output Classifier Integration (Phase 2 Validator)

### Test 10.1 — Internal instruction tier rejected

**Steps:**
1. Create a goal: "Write my company skill guide"
2. Department tries to generate a skill guide (Tier 2 internal)
3. Verify classifier rejects it

**Expected:**
- Artifact NOT created
- Event log shows classification error
- Error message indicates Tier 2 rejection
- Department receives error and may emit alternative action

### Test 10.2 — Operational tier → memo only

**Steps:**
1. Create a goal: "Summarize today's call"
2. Department generates operational summary
3. Verify summary lands in Memo, not Artifacts gallery

**Expected:**
- company_memos row created
- No artifact row created
- No suggested actions for artifact

### Test 10.3 — Deliverable tier → artifact

**Steps:**
1. Create a goal: "Write a pitch deck"
2. Department generates PPTX
3. Verify artifact created in draft

**Expected:**
- Artifact created with `status='draft'`
- Suggested actions generated
- Appears in Sandbox tab

## Section 11: Immutability Layers

### Test 11.1 — API-level rejection

**Steps:**
1. Get active artifact
2. PATCH with title change
3. Verify API fails before database call

**Expected:**
- 409 Conflict returned by `/api/artifacts/[id]`
- No database change

### Test 11.2 — Database trigger enforcement

**Steps:**
1. Via psql (if dev environment allows), try to UPDATE active artifact
2. Trigger rejects the change

**Expected:**
- Trigger throws error
- Transaction rolls back
- Artifact unchanged

### Test 11.3 — UI hides edit controls

**Steps:**
1. Open detail drawer for active artifact
2. Verify no editable fields visible
3. Verify "Make Changes" is the only way to iterate

**Expected:**
- Tabs: Preview, Details, Lineage (no Edit tab)
- Menu shows lock + "Make Changes" + "Archive"
- Input fields are readonly or disabled

## Section 12: End-to-End Flow

### Test 12.1 — Full lifecycle: create → sandbox → review → approve → publish → revise → iterate → publish v2

**Steps:**

1. **Create artifact (Phase 2)**
   - New goal, dispatch to Marketing
   - Artifact lands in `draft`, version=1
   - Verify Sandbox tab shows it
   - Verify Gallery tab hides it

2. **Edit in draft (Phase 2)**
   - Click artifact, open drawer
   - Edit title
   - Verify version bumps to 2
   - Verify status still `draft`

3. **Submit for Review (Phase 3)**
   - Click menu → "Submit for Review"
   - Verify status → `review`, badge → blue "In Review"
   - Verify now visible in Gallery tab

4. **Approve & Publish (Phase 3)**
   - Click menu → "Approve & Publish"
   - Verify status → `active`, badge → green "Published"
   - Verify `published_at` and `approved_by` set
   - Verify version locked

5. **Try to edit (Phase 1)**
   - Try PATCH title
   - Verify 409 Conflict
   - Verify immutability message

6. **Make Changes (Phase 1)**
   - Click menu → "Make Changes"
   - Navigate to goal
   - Verify revision task created with `label="Revise: [title]"`
   - Dispatch task

7. **Revision iteration**
   - New artifact lands in `draft`, version=1 (independent)
   - Edit and test
   - Submit for Review

8. **Approve revision**
   - Approve & Publish
   - Verify new artifact is now `active`
   - Verify original artifact still `active`
   - Both visible in Gallery with separate status histories

**Expected:**
- Full flow succeeds without errors
- All state transitions correct
- Both artifacts maintain independent immutability
- Lineage traceable via goal_id and task metadata

## Section 13: Edge Cases & Error Handling

### Test 13.1 — Orphaned artifact (no goal_id)

**Steps:**
1. Create artifact with `goal_id=null`
2. Try "Make Changes"

**Expected:**
- Endpoint succeeds but creates task without goal association
- Suggested action still created
- New artifact still generated

### Test 13.2 — Revision task dispatch failure

**Steps:**
1. Create revision task via "Make Changes"
2. Dispatch task
3. Department fails (simulate via error injection)

**Expected:**
- Task transitions to `status='failed'`
- Suggested action status → `failed`
- No artifact created
- Founder can retry or skip

### Test 13.3 — Concurrent edits during review

**Steps:**
1. Open artifact in two browser tabs/sessions
2. Attempt simultaneous edits to `draft` artifact
3. One succeeds, one fails due to version check (if implemented)

**Expected:**
- Last-write-wins or conflict error, depending on implementation
- No data corruption
- Error message clear

### Test 13.4 — Artifact with no file_url

**Steps:**
1. Create artifact but omit file_url
2. Try to download
3. Try to preview

**Expected:**
- Preview shows fallback message
- Download triggers file availability check
- No crash

## Validation Checklist

- [ ] All 12+ test sections pass
- [ ] No console errors in browser dev tools
- [ ] No database constraint violations
- [ ] All event log entries correct and chronological
- [ ] Suggested actions routing correct (`execution_path`)
- [ ] Immutability enforced at both API and DB layers
- [ ] UI badges and buttons context-aware and correct
- [ ] Make Changes flow creates proper task + artifact lineage
- [ ] Full lifecycle (draft → review → active → revise → review → active) succeeds
- [ ] All status transition rules enforced
- [ ] Discard/Archive flows work as specified
- [ ] Output classifier integration functional
- [ ] No regressions in other dashboard features

## Smoke Test (Quick validation)

**If short on time, run this 5-minute smoke test:**

1. Create a goal and generate an artifact → verify draft status
2. Switch to Gallery tab → verify artifact hidden
3. Submit for Review → verify blue badge in Gallery
4. Approve & Publish → verify green badge, immutability error on edit attempt
5. Click "Make Changes" → verify revision task appears in goal
6. Dispatch revision → verify new artifact lands in draft
7. Complete revision flow (review → approve) → verify v2 artifact published

If all 7 steps succeed, the sandbox system is functional.

---

## Notes for QA / Product Review

- **Timing**: Full test suite should take ~1 hour with a fresh environment.
- **Data cleanup**: After testing, recommend clearing draft artifacts to avoid clutter. Discarded and deprecated artifacts can accumulate.
- **Browser testing**: Test in Chrome and Firefox (and Safari if iOS/macOS support is a requirement).
- **Accessibility**: Verify button labels and status badges are screen-reader friendly.
- **Mobile**: Brief smoke test on mobile viewport — card layouts and drawer should respond gracefully.

