# GEMINI.md

This file provides foundational mandates for the Gemini CLI when working with the Crost repository. 
**This is your primary reference for workflow compliance.**

---

## Core Mandates (Never Miss)

1.  **CROST_MASTER.md Update**: After *every* session where code is changed, you MUST append a new entry to the top of the session list in `CROST_MASTER.md`. Update the version number and "Last Updated" date.
2.  **Frontend Testing**: Before *every* push to the remote repository, you MUST run:
    *   `cd frontend && npm run type-check`
    *   `cd frontend && npm run lint`
    Ensuring a clean, error-free build is non-negotiable.
3.  **E2E Manual Maintenance**: Update `TEST_MANUAL_E2E.md` *only when really necessary* (e.g., after a major architectural change or a new core feature is added). Keep it concise and focused on high-level founder journeys.
4.  **Surgical Documentation**: When creating reviews (e.g., `Spec_Review_v5.md`), follow the established versioning pattern.
5.  **Git Identity**: Always ensure commits are made using the local identity: `joyadeniran <tommyden25@gmail.com>`.

---

## Technical Context

*   **Package Manager**: `pnpm` (run from `frontend/` for UI tasks).
*   **Database**: Supabase (Migrations in `supabase/migrations/`).
*   **Intelligence**: Groq Llama 3.3 70B is the flagship model default.
*   **Source of Truth**: The singular `company_memo` table is the structured company state; the plural `company_memos` is the granular log. Always dual-write to both.

---

## Learned Protocols (from CLAUDE.md)

*   **API Documentation**: If an API route shape changes, update the relevant documentation (e.g., `API.md` if it exists).
*   **Efficiency**: Use `grep_search` and `read_file` with surgical line ranges to minimize context usage.
*   **Architecture Awareness**: Respect the "Lean Tool Policy" and the "Skills Layer" boundaries.

---

## Success Criteria
A task is only complete when:
- [ ] Code is implemented and verified.
- [ ] Types are checked and Lint is passing.
- [ ] `CROST_MASTER.md` is updated.
- [ ] Changes are committed and pushed.
