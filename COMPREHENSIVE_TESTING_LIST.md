# COMPREHENSIVE TESTING LIST — CROST

This document serves as the master checklist for testing the Crost Company Operating System. Use this to verify features one by one, explore edge cases, and ensure alignment with `CROST_SPEC.md v2.2`.

---

## 1. Onboarding & First-Run Journey
Goal: Verify the "Beat-by-Beat" narrative from §2 of the spec.

- [x] **Landing to Signup:** Pre-filling of email from URL params (`?email=...`).
- [x] **Auth Paths:**
    - [x] Google/Apple OAuth bypasses OTP.
    - [x] Email/Password requires OTP verification before entering onboarding.
- [x] **Identity Collection:** 
    - [x] Three questions (Name, Business, Stage) appear one at a time.
    - [x] Business description is correctly interpreted/summarized by Orc.
- [x] **Control Style:** Selecting Careful/Balanced/Aggressive updates `system_config.risk_tolerance`.
- [x] **Meet Orc:** Introduction screen appears before department selection.
- [x] **Department Selection:** 
    - [x] Minimum 2 departments required.
    - [x] Department cards show model badges and "Add later" hints.
- [x] **First Mission:** 
    - [x] Clickable suggestion chips based on business category.
    - [x] Orc requests activation of missing departments inline in the War Room.
- [x] **Onboarding Resume:** Skipping after Identity enters partial dashboard state with a "Resume setup" banner.

## 2. Orc (Chief of Staff) Intelligence
- [x] **Planning:** Orc decomposes complex goals into a multi-task waterfall.
- [x] **Assistant Actions:** Direct requests (e.g., "Send to email") are handled by Orc without spawning a department.
- [x] **Contextual Memory:** Orc references identity data and prior decisions from the Memo in chat.
- [x] **Voice & Tone:** Responses are competent, concise, and proactive (not robotic).

## 3. War Room & Interaction Modes
- [x] **Default Mode:** Orc handles planning and coordination for plain text input.
- [x] **Department Mentions (`@dept`):**
    - [x] Direct routing to the specific department.
    - [x] Skill loading for direct department tasks.
- [x] **Tool Invocations (`/tool`):** 
    - [x] Direct tool execution via the gateway.
    - [x] Correct handling of `missing_connection` and `requires_approval`.
- [x] **Processing Messages:** Office-themed messages show during loading states.

## 4. Artefacts Gallery & Lineage
- [x] **Creation:** Artefacts are produced with `file_url`, `file_size`, and `task_id`.
- [x] **Previews:**
    - [x] In-browser PDF preview.
    - [x] Office Online embed for DOCX, PPTX, XLSX.
    - [x] Inline preview for images.
- [x] **Citations (Sources):** 
    - [x] Every artefact card footer lists Memo, KB, and Tool sources.
    - [x] Tool calls show JSON details in the drawer.
- [x] **Lineage:** Metadata tab shows which Task and Goal produced the artefact.

## 5. Suggested Next Actions (Chips)
- [x] **Generation:** 2–3 follow-up chips appear after mission completion.
- [x] **UX Flow:**
    - [x] Inline input panel for "Send to email" (destination input).
    - [x] Risk-level color coding (Amber/Green).
- [x] **HITL Integration:** Tapping high-risk chips inserts an approval request into the Inbox.
- [x] **Audit Trail:** Completed chips stay visible on the artefact/report card.

## 6. Memo & Company Memory
- [x] **Singular `company_memo`:** New writes populate `task_logs`, `decisions`, and `strategies`.
- [x] **Legacy `company_memos`:** Chat history and department notes are preserved.
- [x] **Extraction:** Orc accurately summarizes the current state of the company from the Memo.

## 7. Knowledge Base
- [x] **Upload:** Drag-and-drop support for PDF, DOCX, XLSX, etc.
- [x] **Extraction:** Async extraction of text from uploaded files.
- [x] **Search:** `knowledge_base_search` returns relevant context and records the source on the calling artefact.

## 8. Inbox & Approvals
- [x] **Risk Thresholds:** 
    - [x] `careful` gates everything.
    - [x] `aggressive` auto-runs low/medium risk.
- [x] **Real-time Badge:** Red count on the bell icon updates instantly.
- [x] **Chain Reaction:** Approving a task unblocks dependent tasks in the waterfall.

## 9. BYOK & Usage
- [x] **Key Resolver:** User API keys override system keys.
- [x] **Quota Bar:** Progress bar reflects daily usage and resets at midnight UTC.
- [x] **Exemption:** First goal execution does not count against the daily limit.

---
*Last Updated: April 27, 2026*
