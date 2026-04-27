# COMPREHENSIVE TESTING LIST — CROST

This document serves as the master checklist for testing the Crost Company Operating System. Use this to verify features one by one, explore edge cases, and ensure alignment with `CROST_SPEC.md v2.2`.

---

## 1. Onboarding & First-Run Journey
Goal: Verify the "Beat-by-Beat" narrative from §2 of the spec.

- [ ] **Landing to Signup:** Pre-filling of email from URL params (`?email=...`).
- [ ] **Auth Paths:**
    - [ ] Google/Apple OAuth bypasses OTP.
    - [ ] Email/Password requires OTP verification before entering onboarding.
- [ ] **Identity Collection:** 
    - [ ] Three questions (Name, Business, Stage) appear one at a time.
    - [ ] Business description is correctly interpreted/summarized by Orc.
- [ ] **Control Style:** Selecting Careful/Balanced/Aggressive updates `system_config.risk_tolerance`.
- [ ] **Meet Orc:** Introduction screen appears before department selection.
- [ ] **Department Selection:** 
    - [ ] Minimum 2 departments required.
    - [ ] Department cards show model badges and "Add later" hints.
- [ ] **First Mission:** 
    - [ ] Clickable suggestion chips based on business category.
    - [ ] Orc requests activation of missing departments inline in the War Room.
- [ ] **Onboarding Resume:** Skipping after Identity enters partial dashboard state with a "Resume setup" banner.

## 2. Orc (Chief of Staff) Intelligence
- [ ] **Planning:** Orc decomposes complex goals into a multi-task waterfall.
- [ ] **Assistant Actions:** Direct requests (e.g., "Send to email") are handled by Orc without spawning a department.
- [ ] **Contextual Memory:** Orc references identity data and prior decisions from the Memo in chat.
- [ ] **Voice & Tone:** Responses are competent, concise, and proactive (not robotic).

## 3. War Room & Interaction Modes
- [ ] **Default Mode:** Orc handles planning and coordination for plain text input.
- [ ] **Department Mentions (`@dept`):**
    - [ ] Direct routing to the specific department.
    - [ ] Skill loading for direct department tasks.
- [ ] **Tool Invocations (`/tool`):** 
    - [ ] Direct tool execution via the gateway.
    - [ ] Correct handling of `missing_connection` and `requires_approval`.
- [ ] **Processing Messages:** Office-themed messages show during loading states.

## 4. Artefacts Gallery & Lineage
- [ ] **Creation:** Artefacts are produced with `file_url`, `file_size`, and `task_id`.
- [ ] **Previews:**
    - [ ] In-browser PDF preview.
    - [ ] Office Online embed for DOCX, PPTX, XLSX.
    - [ ] Inline preview for images.
- [ ] **Citations (Sources):** 
    - [ ] Every artefact card footer lists Memo, KB, and Tool sources.
    - [ ] Tool calls show JSON details in the drawer.
- [ ] **Lineage:** Metadata tab shows which Task and Goal produced the artefact.

## 5. Suggested Next Actions (Chips)
- [ ] **Generation:** 2–3 follow-up chips appear after mission completion.
- [ ] **UX Flow:**
    - [ ] Inline input panel for "Send to email" (destination input).
    - [ ] Risk-level color coding (Amber/Green).
- [ ] **HITL Integration:** Tapping high-risk chips inserts an approval request into the Inbox.
- [ ] **Audit Trail:** Completed chips stay visible on the artefact/report card.

## 6. Memo & Company Memory
- [ ] **Singular `company_memo`:** New writes populate `task_logs`, `decisions`, and `strategies`.
- [ ] **Legacy `company_memos`:** Chat history and department notes are preserved.
- [ ] **Extraction:** Orc accurately summarizes the current state of the company from the Memo.

## 7. Knowledge Base
- [ ] **Upload:** Drag-and-drop support for PDF, DOCX, XLSX, etc.
- [ ] **Extraction:** Async extraction of text from uploaded files.
- [ ] **Search:** `knowledge_base_search` returns relevant context and records the source on the calling artefact.

## 8. Inbox & Approvals
- [ ] **Risk Thresholds:** 
    - [ ] `careful` gates everything.
    - [ ] `aggressive` auto-runs low/medium risk.
- [ ] **Real-time Badge:** Red count on the bell icon updates instantly.
- [ ] **Chain Reaction:** Approving a task unblocks dependent tasks in the waterfall.

## 9. BYOK & Usage
- [ ] **Key Resolver:** User API keys override system keys.
- [ ] **Quota Bar:** Progress bar reflects daily usage and resets at midnight UTC.
- [ ] **Exemption:** First goal execution does not count against the daily limit.

---
*Last Updated: April 27, 2026*
