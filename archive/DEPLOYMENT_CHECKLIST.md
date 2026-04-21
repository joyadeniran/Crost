# Deployment Checklist — Memos vs Artifacts Fix

## Status: ✅ CODE DEPLOYED

All code files have been deployed to your Crost application. This checklist guides you through the remaining verification and testing steps.

---

## Part 1: Pre-Testing Verification

### File Deployment Checklist
- [x] Department Task Endpoint (`app/api/departments/[slug]/task/route.ts`) — **DEPLOYED**
- [x] Worker Execute Endpoint (`app/api/worker/execute/route.ts`) — **DEPLOYED**
- [x] Artifacts Endpoint (`app/api/artifacts/route.ts`) — **DEPLOYED**
- [x] Company Memo Library (`lib/company-memo.ts`) — **DEPLOYED**
- [x] Database Migration (`supabase/migrations/20260414_create_structured_company_memo.sql`) — **READY**
- [x] Backup Files Created (`.backup.ts` versions) — **CREATED**

### Code Quality Checks
- [x] Department Task: Size-based separation logic (lines 260-286)
- [x] Worker Execute: File upload to Supabase Storage (lines 26-103)
- [x] Artifacts: File URL requirement enforced (line 63)
- [x] Company Memo: Typed interfaces for all operations (lines 10-70)

### Documentation Deployed
- [x] Fix Summary (`MEMOS_ARTIFACTS_FIX_SUMMARY.md`)
- [x] Detailed Analysis (`MEMOS_VS_ARTIFACTS_ANALYSIS.md`)
- [x] Implementation Guide (`IMPLEMENTATION_GUIDE.md`)
- [x] This Deployment Checklist (`DEPLOYMENT_CHECKLIST.md`)

---

## Part 2: Next Steps (You Need to Do)

### Step 1: Apply Database Migration
**Time: ~5 minutes**

```bash
# Option A: Via Supabase CLI
cd /sessions/ecstatic-clever-lovelace/mnt/Crost
supabase db push

# Option B: Via Supabase Dashboard
# 1. Go to Supabase Dashboard → SQL Editor
# 2. Copy content from: supabase/migrations/20260414_create_structured_company_memo.sql
# 3. Run the SQL
# 4. Verify company_memo table exists
```

**Verification**:
```sql
-- Run in Supabase SQL Editor to verify
SELECT * FROM information_schema.tables 
WHERE table_name = 'company_memo';
-- Should return 1 row
```

### Step 2: Rebuild Application
**Time: ~2-3 minutes**

```bash
cd /sessions/ecstatic-clever-lovelace/mnt/Crost/frontend

# Install any new dependencies (if needed)
npm install

# Build to verify no type errors
npm run build

# Start dev server
npm run dev
```

**Expected Output**:
- No TypeScript errors
- Build completes successfully
- Dev server starts on localhost:3000

### Step 3: Manual Testing

#### Test 3A: Small Output (Stays as Memo)
```bash
# Use your admin interface or API client to:
POST /api/departments/marketing/task
{
  "task": "Write a short social media post about our new product",
  "session_id": "test-001"
}

# Expected Response:
{
  "answer": "Here's a short social media post...",
  "approval_requested": false,
  "artifact_id": undefined  // No artifact for small output
}

# Check: company_memos table should have new entry with post content
```

#### Test 3B: Large Structured Output (Creates Artifact)
```bash
# Use your admin interface or API client to:
POST /api/departments/engineering/task
{
  "task": "Analyze our codebase and provide a detailed JSON report of all components, dependencies, and metrics",
  "session_id": "test-002"
}

# Expected Response:
{
  "answer": "...",
  "approval_requested": false,
  "artifact_id": "550e8400-e29b-41d4-a716-446655440000"  // UUID returned
}

# Check:
# 1. artifacts table has entry with file_url (not body)
# 2. Supabase Storage has file at: artifacts/departments/{dept_id}/{filename}.json
# 3. company_memos has entry referencing artifact ID
# 4. File is downloadable from file_url
```

#### Test 3C: Verify Artifact Download
```bash
# Get the file_url from artifacts table
# Try downloading it in browser or curl:
curl -O "https://your-supabase-url.storage.googleapis.com/..."

# Should return the actual JSON file content
```

### Step 4: Verify Database Changes
**Time: ~2 minutes**

Run these SQL queries in Supabase SQL Editor:

```sql
-- 1. Verify company_memo table structure
\d company_memo

-- 2. Check RLS policies
SELECT * FROM pg_policies 
WHERE tablename = 'company_memo';

-- 3. Test insertion (replace with your user_id)
INSERT INTO company_memo (user_id, company_profile)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '{"name": "Test Company", "industry": "Tech"}'::jsonb
)
RETURNING *;

-- 4. Verify artifact references support
SELECT artefact_references FROM company_memo LIMIT 1;
-- Should show array type UUID[]
```

### Step 5: Check Backward Compatibility
**Time: ~5 minutes**

Verify existing memos still work:

```bash
# Check if old memo structure still accessible
GET /api/memos?department=marketing&limit=10

# Existing memos should still be readable
# Old data is NOT affected by new changes
```

---

## Part 3: Rollback Plan (If Needed)

If issues arise, rollback is simple:

```bash
cd /sessions/ecstatic-clever-lovelace/mnt/Crost/frontend

# 1. Restore original endpoints
cp app/api/departments/\[slug\]/task/route.backup.ts app/api/departments/\[slug\]/task/route.ts
cp app/api/worker/execute/route.backup.ts app/api/worker/execute/route.ts
cp app/api/artifacts/route.backup.ts app/api/artifacts/route.ts

# 2. Rebuild and restart
npm run build
npm run dev

# 3. If database issues, drop new table (optional)
# In Supabase SQL Editor:
# DROP TABLE IF EXISTS company_memo CASCADE;
```

**Recovery Time**: <5 minutes

---

## Part 4: Common Issues & Fixes

### Issue: TypeScript Compilation Error
**Cause**: Missing `lib/company-memo.ts` imports  
**Fix**:
```bash
# Verify file exists
ls -la /sessions/ecstatic-clever-lovelace/mnt/Crost/frontend/lib/company-memo.ts

# If missing, copy it:
cp lib/company-memo.ts lib/company-memo.ts.backup
# And rebuild
npm run build
```

### Issue: Migration Won't Apply
**Cause**: Syntax error or table already exists  
**Fix**:
```sql
-- Check if table exists
SELECT * FROM information_schema.tables 
WHERE table_name = 'company_memo';

-- If it exists, drop it first (careful!)
DROP TABLE IF EXISTS company_memo CASCADE;

-- Then re-run migration
```

### Issue: File Upload Fails
**Cause**: Supabase Storage bucket doesn't exist or no permissions  
**Fix**:
```bash
# In Supabase Dashboard → Storage:
# 1. Create bucket named "artifacts" if it doesn't exist
# 2. Make it public (Settings → Access)
# 3. Add RLS policy if needed:
#    INSERT: (auth.role() = 'authenticated')
#    SELECT: true (public)
```

### Issue: Artifact Download Returns 404
**Cause**: file_url in database is incorrect  
**Fix**:
```bash
# Check file_url format in artifacts table:
SELECT id, file_url FROM artifacts LIMIT 5;

# Should look like:
# https://projectid.supabase.co/storage/v1/object/public/artifacts/...

# If missing or wrong, regenerate:
SELECT supabase_url || '/storage/v1/object/public/' || storage_path as correct_url
FROM artifacts;
```

---

## Part 5: Success Criteria

After deployment, verify:

- [ ] `npm run build` completes with 0 errors
- [ ] Dev server starts without errors
- [ ] `company_memo` table exists in database
- [ ] Small department tasks create memo entries
- [ ] Large structured tasks create artifact files
- [ ] Artifact files are downloadable from Supabase Storage
- [ ] Existing memos still readable and unchanged
- [ ] No errors in event logs
- [ ] TypeScript type checking passes

---

## Part 6: Post-Deployment Tasks

### Optional: Migrate Existing Large Memos
If you have existing large memos, optionally migrate them:

```typescript
// Script to run in your app or manually:
const { data: largeMemos } = await supabase
  .from('company_memos')
  .select('*')
  .gt('body', 1200)
  .eq('source_type', 'agent');

for (const memo of largeMemos) {
  // Create artifact from memo body
  const fileContent = memo.body;
  const { data: upload } = await supabase
    .storage
    .from('artifacts')
    .upload(`legacy/${memo.id}.json`, fileContent);
  
  // Update memo to reference artifact
  await supabase
    .from('company_memos')
    .update({
      body: `Archived to artifact. Original ID: ${memo.id}`,
      tags: [...(memo.tags || []), 'archived_v2']
    })
    .eq('id', memo.id);
}
```

---

## Part 7: Monitoring

After deployment, monitor:

### Event Logs
```bash
# Check for artifact creation events
SELECT event_type, count(*) 
FROM event_log 
WHERE event_type IN ('artifact_created', 'tool_called')
AND created_at > now() - interval '1 day'
GROUP BY event_type;
```

### Storage Usage
```bash
# Monitor artifact storage growth
SELECT 
  count(*) as artifact_count,
  round(sum((metadata->>'sizeBytes')::numeric) / 1024.0 / 1024, 2) as size_mb
FROM artifacts;
```

### Error Tracking
```bash
# Check for errors in task execution
SELECT department_slug, count(*) 
FROM event_log
WHERE event_type = 'task_failed'
AND created_at > now() - interval '1 day'
GROUP BY department_slug;
```

---

## Summary

✅ **Code Status**: All files deployed and ready  
⏳ **Next Action**: Apply database migration  
📋 **Testing**: Follow Part 2 steps in order  
🔄 **Rollback**: Simple (< 5 minutes if needed)  
⏱️ **Total Time**: ~30-45 minutes to full deployment + testing  

**Questions?** Check `IMPLEMENTATION_GUIDE.md` for detailed instructions or `MEMOS_VS_ARTIFACTS_ANALYSIS.md` for technical details.

Deploy with confidence! 🚀
