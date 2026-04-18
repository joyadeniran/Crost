> This is a working document.
> Builders must keep this updated after every major change.

# CROST MASTER (Execution Log)

**Current Version:** 10.2  
**Last Updated:** April 18, 2026  
**Deployment Status:** 🚀 Live — Schema Stabilization & Performance Hardening (v10.2).

---

## Session v10.2 - Department Cloning Fix & Approval Queue Optimization

**Date**: April 18, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Resolved "Department templates cannot be copied" error by fixing global unique constraint leakage; eliminated `approval_queue` timeouts via performance indexing and query scoping.

### Root Cause Analysis

**Issue 1 — Cloning Failure**: 
`POST /api/departments` failed when multiple users tried to clone the same template (e.g., "sales").
- **Finding**: While `slug` and `name` constraints were fixed in v6.8, the `orc_persona_id` (formerly `onyx_persona_id`) column retained a legacy `UNIQUE` constraint. Since all users cloning "sales" were assigned `direct_llm:sales`, every user after the first one triggered a unique violation.

**Issue 2 — Approval Queue Timeout**:
The `approval_queue` query for the notification bell (`pendingCount`) was hanging or returning "no response".
- **Finding**: The client-side poll in `LayoutStoreHydrator.tsx` was performing an unscoped query (`select('id').eq('status', 'pending')`) without indexes on `status`, `created_by`, or `user_id`. Large table sizes or slow RLS resolution led to timeouts.

### Changes

**1. Migration `20260418030000_fix_cloning_and_performance.sql`**
- **Constraint Cleanup**: Dropped `departments_onyx_persona_id_key` and `departments_orc_persona_id_key`.
- **Indexing**: Added indexes to `approval_queue` on `created_by`, `user_id`, and `status`.
- **Lookups**: Added index to `departments` on `created_by`.

**2. `frontend/components/providers/LayoutStoreHydrator.tsx`**
- **Query Scoping**: Updated `refreshCount` to explicitly filter by the authenticated user's ID (`or(created_by, user_id)`), ensuring the database utilizes indexes and RLS resolves instantly.

**3. `frontend/app/api/departments/route.ts`**
- **Error Clarity**: Refined the unique constraint error message to mention `orc_persona_id` conflict and the required migration version (v10.2).

### Files Changed
- `supabase/migrations/20260418030000_fix_cloning_and_performance.sql` (new)
- `frontend/components/providers/LayoutStoreHydrator.tsx`
- `frontend/app/api/departments/route.ts`
- `CROST_MASTER.md` (this entry)

---

## Session v10.1 - Build Repair & Onboarding State Resilience

**Date**: April 18, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Fixed critical build failure on Render; resolved state loss issue during onboarding team selection; hardened department activation logic.

... [rest of previous content]
