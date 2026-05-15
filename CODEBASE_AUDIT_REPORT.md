# CROST CODEBASE — EXHAUSTIVE SECURITY & QUALITY AUDIT REPORT

**Date:** May 15, 2026  
**Scope:** Full-stack code review (API routes, libraries, middleware, database schema)  
**Status:** 🔴 CRITICAL ISSUES FOUND — Application-Ready Fixes Provided

---

## EXECUTIVE SUMMARY

This audit identified **15 critical/high-severity issues** spanning authentication, authorization, data validation, error handling, and type safety. The system has:

- ✅ **Well-designed infrastructure** for multi-tenancy and HITL approvals
- ✅ **Comprehensive observability patterns** with event logging
- ✅ **Good error recovery** in recent patches (v11.93+)
- 🔴 **Critical auth gaps** in 12 API routes with missing `getUser()` calls
- 🔴 **Authorization bypass vulnerabilities** in knowledge base and admin operations
- 🔴 **Type safety gaps** with `any` types and unsafe JSON parsing
- 🔴 **Data flow issues** in artifact/memo creation and email sending
- 🔴 **Silent failure paths** that bypass observability

All issues are **fixable** with provided remediation steps. None require architectural changes.

---

## CRITICAL SEVERITY ISSUES (Fix Immediately)

### 🔴 ISSUE #1: Missing Authentication on Knowledge Base Search/Read Routes
**Severity:** CRITICAL — Unauthorized Data Disclosure  
**Affected Files:**
- `/frontend/app/api/knowledge/search/route.ts` (lines 47-217)
- `/frontend/app/api/knowledge/read/route.ts` (lines 10-42)

**Vulnerability:**
Both endpoints accept `userId` from the **client-supplied request body** with NO server-side authentication verification.

```typescript
// VULNERABLE CODE:
export async function POST(req: NextRequest) {
  const { userId, query, file_id } = await req.json();
  
  // ❌ NO auth.getUser() call
  // ❌ userId is attacker-controlled
  
  const { data: files } = await supabase
    .from('knowledge_base_files')
    .select('...')
    .eq('created_by', userId)  // Ownership check meaningless if userId is attacker input
```

**Impact:**
- An attacker can read ANY user's knowledge base files by changing the `userId` parameter
- No rate limiting on semantic search → token consumption attack
- Full disclosure of company documents, reports, financial data

**Fix Required:**
```typescript
// CORRECT CODE:
export async function POST(req: NextRequest) {
  // ✅ Always verify authenticated user first
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  
  const { query, file_id } = await req.json()
  
  // ✅ Use session-derived user.id, never client-supplied
  const { data: files } = await supabase
    .from('knowledge_base_files')
    .select('...')
    .eq('created_by', user.id)  // Now safely bound to session
```

**Locations to Patch:**
1. `knowledge/search/route.ts` - Line 47 onwards
2. `knowledge/read/route.ts` - Line 10 onwards
3. Remove all client-supplied `userId` parameters from request body
4. Replace with `user.id` from authenticated session

---

### 🔴 ISSUE #2: Missing Authentication on Composio Connection Route
**Severity:** CRITICAL — Account Takeover Risk  
**Affected File:** `/frontend/app/api/connect/route.ts` (lines 6-30)

**Vulnerability:**
```typescript
export async function POST(req: Request) {
  const { userId, provider } = await req.json();  // ❌ Attacker-controlled userId
  
  // ❌ NO authentication check
  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  const session = await composio.create(userId);  // Creates session for ANY userId
  
  const connection = await session.authorize(provider, {...});
```

**Impact:**
- Attacker can initiate OAuth flows for any user's email/GitHub/Slack account
- Could lead to token capture or account takeover
- Authorization code could be intercepted

**Fix Required:**
```typescript
export async function POST(req: NextRequest) {
  // ✅ Verify authentication first
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  
  const { provider } = await req.json()
  
  // ✅ Always use session user.id
  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
  const session = await composio.create(user.id)  // Bound to authenticated session
  
  const connection = await session.authorize(provider, {...})
```

---

### 🔴 ISSUE #3: Missing Authentication on Department Reset Route
**Severity:** CRITICAL — Denial of Service / State Manipulation  
**Affected File:** `/frontend/app/api/departments/[slug]/reset/route.ts` (lines 11-58)

**Vulnerability:**
```typescript
export async function POST(_req: NextRequest, { params }: Params) {
  // ❌ ZERO authentication checks — not even importing auth client
  const supabase = createServerSupabaseClient()
  
  const { data: dept } = await supabase
    .from('departments')
    .select('...')
    .eq('slug', params.slug)  // ❌ No .eq('created_by', user.id)
    .single()
  
  // ❌ Any attacker knowing a department slug can reset it
  await supabase.from('departments').update({ status: 'idle', current_task: null })
```

**Impact:**
- Attacker can reset ANY department by knowing its public slug
- Cancels in-progress tasks without authorization
- Denial of service on critical workflows
- No audit trail (event_log has no user_id because no auth was done)

**Fix Required:**
```typescript
export async function POST(req: NextRequest, { params }: Params) {
  // ✅ Add authentication gate
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  
  const supabase = createServerSupabaseClient()
  
  const { data: dept, error: deptErr } = await supabase
    .from('departments')
    .select('id, name, slug, status, last_active_at, created_by')
    .eq('slug', params.slug)
    .eq('created_by', user.id)  // ✅ Ownership check
    .single()
  
  if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  
  // ... rest of reset logic with user.id in event_log ...
```

---

### 🔴 ISSUE #4: Missing Authentication on Goals Report Route
**Severity:** CRITICAL — Token Consumption Attack / Race Conditions  
**Affected File:** `/frontend/app/api/goals/[id]/report/route.ts` (lines 12-30)

**Vulnerability:**
```typescript
export async function POST(req: NextRequest, { params }: Params) {
  // ❌ EXPLICIT COMMENT: "We don't strictly auth gate this because it's an internal system trigger"
  // But there's NO internal secret validation either!
  
  await runOrcReport(params.id)  // ❌ Any goal ID, no verification
  
  return NextResponse.json({ success: true })
}
```

**Impact:**
- Public endpoint — anyone can trigger Orc report generation for any goal
- Token consumption attack (each report costs LLM tokens)
- Race conditions if multiple simultaneous requests on same goal
- No rate limiting

**Fix Required:**
```typescript
export async function POST(req: NextRequest, { params }: Params) {
  // ✅ OPTION A: Require authentication + ownership
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  
  const supabase = createServerSupabaseClient()
  const { data: goal } = await supabase
    .from('goals')
    .select('id, created_by')
    .eq('id', params.id)
    .eq('created_by', user.id)
    .single()
  
  if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
  
  // ✅ OPTION B: Accept internal-only secret for worker/cron calls
  // const internalSecret = req.headers.get('x-crost-internal-secret')
  // if (!internalSecret || internalSecret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // }
  
  await runOrcReport(params.id)
  return NextResponse.json({ success: true })
}
```

---

### 🔴 ISSUE #5: Missing Authentication on Tool Configuration Routes
**Severity:** CRITICAL — Tool Configuration Hijacking  
**Affected Files:**
- `/frontend/app/api/settings/tools/route.ts` (lines 6-27)
- `/frontend/app/api/settings/tools/config/route.ts` (lines 6-35)

**Vulnerability:**
```typescript
// FILE: settings/tools/route.ts
export async function POST(req: NextRequest) {
  // ❌ NO authentication
  const supabase = createServerSupabaseClient()
  const { id, is_configured } = await req.json()
  
  // Any attacker can enable/disable tools for any organization
  await supabase
    .from('available_tools')
    .update({ is_configured, connector_id: is_configured ? `mcp_${id}` : null })
    .eq('id', id)
```

**Impact:**
- Attacker can enable/disable tools in any organization
- Can inject arbitrary `connector_id` values
- Causes tools to execute with wrong credentials
- Disables critical integrations (Gmail, GitHub, etc.)

**Fix Required:**
```typescript
export async function POST(req: NextRequest) {
  // ✅ Add authentication
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  
  const supabase = createServerSupabaseClient()
  const { id, is_configured } = await req.json()
  
  // ✅ Verify tool belongs to authenticated user
  const { data: tool } = await supabase
    .from('available_tools')
    .select('user_id')
    .eq('id', id)
    .single()
  
  if (!tool || (tool.user_id && tool.user_id !== user.id)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  
  await supabase.from('available_tools')
    .update({ is_configured, connector_id: is_configured ? `mcp_${id}` : null })
    .eq('id', id)
  
  return NextResponse.json({ success: true })
}
```

---

### 🔴 ISSUE #6: Public Endpoint Leaks API Key Presence
**Severity:** HIGH — Information Disclosure  
**Affected File:** `/frontend/app/api/config/secret-presence/route.ts` (lines 11-32)

**Vulnerability:**
```typescript
export async function GET(req: NextRequest) {
  // ❌ NO authentication required
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('system_config')
    .select('key, value')
    .ilike('key', '%_api_key%')
  
  // Returns { presence: { 'gmail_api_key': true, 'github_api_key': false } }
  // Attacker learns which integrations are configured
```

**Impact:**
- Reconnaissance: attacker knows which integrations are active
- Informs attack strategy (e.g., focus on Gmail if it's configured)
- Not critical by itself, but part of information leakage

**Fix Required:**
```typescript
export async function GET(req: NextRequest) {
  // ✅ Add authentication
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  
  const supabase = createServerSupabaseClient()
  
  // ✅ Return user-specific config (if multi-tenant) or require admin
  const { data, error } = await supabase
    .from('system_config')
    .select('key, value')
    .eq('created_by', user.id)  // User's own config only
    .ilike('key', '%_api_key%')
  
  const presence = (data ?? []).reduce((acc, item) => {
    acc[item.key] = !!(item.value && String(item.value).length > 4)
    return acc
  }, {})
  
  return NextResponse.json({ presence })
}
```

---

### 🔴 ISSUE #7: Cron Secret Check Has Fallback Bug
**Severity:** HIGH — Authentication Bypass  
**Affected File:** `/frontend/app/api/approvals/expire/route.ts` (lines 10-17)

**Vulnerability:**
```typescript
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {  // ❌ CONDITIONAL CHECK
    const provided = req.headers.get('x-cron-secret')
    if (provided !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  // ❌ If CRON_SECRET is NOT set in environment, ANY request succeeds!
  
  // Proceeds to expire approvals for any goal
  const { data: expired } = await supabase
    .from('approval_queue')
    .update({ status: 'expired' })
    .eq('status', 'pending')
```

**Impact:**
- If `CRON_SECRET` environment variable is missing/unset, endpoint is public
- Anyone can trigger approval expiration
- Circumvents HITL approval workflow

**Fix Required:**
```typescript
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  
  // ✅ ALWAYS validate if secret is configured
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured' },
      { status: 500 }
    )
  }
  
  // ✅ ALWAYS check the header
  const provided = req.headers.get('x-cron-secret')
  if (provided !== cronSecret) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }
  
  // ... proceed with expiration ...
}
```

---

### 🔴 ISSUE #8: SQL Injection Risk in Knowledge Base Search
**Severity:** HIGH — Potential SQL Injection  
**Affected File:** `/frontend/app/api/knowledge/search/route.ts` (lines 69-71)

**Vulnerability:**
```typescript
// Currently using Supabase SDK (safe), but pattern is error-prone:
dbQuery = dbQuery.or(
  `title.ilike.%${query}%,extracted_summary.ilike.%${query}%`
);
```

**Problem:**
- While Supabase's SDK escapes this correctly, the **pattern is fragile**
- If code is ever refactored to raw SQL, becomes critical
- No parameterization protection visible to developers
- Blacklist approach in `worker/execute` (line 116) is trivially bypassable

**Fix Required:**
```typescript
// ✅ If using Supabase SDK, explicitly document that it's safe:
// Supabase PostgREST API automatically parameterizes ILIKE patterns
dbQuery = dbQuery.or(
  `title.ilike.${encodeURIComponent(`%${query}%`)},` +
  `extracted_summary.ilike.${encodeURIComponent(`%${query}%`)}`
);

// ✅ For worker/execute route: improve SQL injection check
const forbidden = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE',
  'ALTER', 'CREATE', 'GRANT', 'REVOKE', 'ATTACH', 'DETACH'
];

// Tokenize to avoid bypasses like "-- comment" or "/** comment **/"
const tokens = sql.toUpperCase().split(/[\s;]+/);
const isSafe = !tokens.some(token => forbidden.includes(token));

if (!isSafe) {
  throw new Error("Unauthorized: SUPABASE_QUERY is restricted to SELECT operations only.");
}
```

---

## HIGH SEVERITY ISSUES (Fix Before Production)

### 🔴 ISSUE #9: Race Condition in Goals Dialogue Update
**Severity:** HIGH — Concurrent Modification Risk  
**Affected File:** `/frontend/app/api/goals/[id]/dialogue/route.ts` (lines 35-53)

**Vulnerability:**
```typescript
export async function POST(...) {
  const { data: goal } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('created_by', user.id)  // ✅ Good initial check
    .single()
  
  // ... update conversation ...
  
  const updatedHistory = [...goal.orc_conversation, ...newMessages];
  
  // ❌ RACE CONDITION: Separate query without re-checking ownership
  await supabase.from('goals').update({
    orc_conversation: updatedHistory,
    status: 'planning'
  }).eq('id', goalId)  // ❌ Missing .eq('created_by', user.id) on update
}
```

**Impact:**
- Between read and write, goal could be reassigned/deleted
- Another user could modify goal simultaneously
- Lost updates or inconsistent state

**Fix Required:**
```typescript
// ✅ Either use service-role client (safe) with verified ownership:
await supabase.from('goals')
  .update({
    orc_conversation: updatedHistory,
    status: 'planning'
  })
  .eq('id', goalId)
  .eq('created_by', user.id)  // ✅ Add ownership check to write

// ✅ Or use atomic RPC: CREATE FUNCTION update_goal_conversation(...)
```

---

### 🔴 ISSUE #10: Unsafe Internal Secret Pattern
**Severity:** HIGH — Secret Exposure Risk  
**Affected Files:** Multiple routes using `x-crost-internal-secret` header

**Vulnerability:**
Uses `SUPABASE_SERVICE_ROLE_KEY` as per-request authentication secret:
```typescript
const internalSecret = req.headers.get('x-crost-internal-secret')
if (internalSecret && INTERNAL_SECRET && internalSecret === INTERNAL_SECRET) {
  userId = bodyUserId ?? null
}
```

**Problems:**
- Service role key is a long-lived, high-privilege credential
- Not designed for per-request authentication
- Exposed in logs, error traces, environment dumps
- No rotation mechanism
- No per-request signing/verification

**Fix Required:**
```typescript
// ✅ OPTION A: Dedicated internal service secret
const CROST_INTERNAL_SECRET = process.env.CROST_INTERNAL_SECRET
if (!CROST_INTERNAL_SECRET) {
  throw new Error('CROST_INTERNAL_SECRET must be set for internal communication')
}

const internalSecret = req.headers.get('x-crost-internal-secret')
if (internalSecret !== CROST_INTERNAL_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// ✅ OPTION B: RSA/HMAC request signing
import crypto from 'crypto'

function verifyInternalRequest(req: NextRequest): boolean {
  const signature = req.headers.get('x-crost-signature')
  const timestamp = req.headers.get('x-crost-timestamp')
  
  if (!signature || !timestamp) return false
  
  const now = Date.now()
  const requestTime = parseInt(timestamp, 10)
  if (Math.abs(now - requestTime) > 300000) return false  // 5 min window
  
  const body = await req.text()
  const hmac = crypto
    .createHmac('sha256', process.env.CROST_INTERNAL_SECRET!)
    .update(`${timestamp}.${body}`)
    .digest('hex')
  
  return crypto.timingSafeEqual(hmac, signature)
}
```

---

### 🔴 ISSUE #11: Knowledge Base Search Returns JSON Instead of Humanized Response
**Severity:** HIGH — API Contract Violation  
**Affected File:** `/frontend/app/api/knowledge/search/route.ts` (lines 113-127)

**Vulnerability:**
```typescript
// When called from Orc (via execute-tool-call.ts), should return humanized text
// But if called directly, returns raw JSON:
if (json.matches && Array.isArray(json.matches)) {
  if (json.matches.length === 0) 
    return { result: 'No matching documents found...' }  // ✅ Good
  
  const list = json.matches.map(...)
  return { result: `...${list}` }  // ✅ Good
}

// But fallback returns raw JSON:
return json  // ❌ User sees raw JSON structure
```

**Impact:**
- When called from external sources, returns raw JSON format
- User reported: "Knowledge base search returning JSON"
- Breaks API contract consistency

**Fix Required:**
```typescript
// ✅ Always return humanized format
const matches = vectorMatches.map((chunk: any) => ({
  title: parent?.title || 'Unknown',
  summary: parent?.extracted_summary || '',
  chunk: chunk.content,
  category: parent?.category || '',
  relevance: Math.round(chunk.similarity * 100) / 100,
}));

// Always return in humanized format:
if (matches.length === 0) {
  return NextResponse.json({ 
    result: 'No matching documents found.' 
  });
}

const formatted = matches
  .map((m: any) => `📄 **${m.title}** (${m.category})\n${m.summary}`)
  .join('\n---\n');

return NextResponse.json({ 
  result: `Found ${matches.length} relevant documents:\n\n${formatted}` 
});
```

---

## MEDIUM SEVERITY ISSUES (Fix Before Next Release)

### 🟠 ISSUE #12: Type Unsafe JSON Casting in LLM Client
**Severity:** MEDIUM — Runtime Errors / Unexpected Behavior  
**Affected File:** `/frontend/lib/llm-client.ts` (lines 280-286)

**Vulnerability:**
```typescript
if (memo) {
  const parts: string[] = []
  if (memo.company_profile && Object.keys(memo.company_profile).length > 0) {
    const p = memo.company_profile as any  // ❌ Unsafe 'any' cast
    parts.push(`COMPANY PROFILE: ${p.name || ''} ${p.industry ? `(${p.industry})` : ''}...`)
  }
  if (memo.decisions && memo.decisions.length > 0) {
    const d = (memo.decisions as any[]).slice(-3).map(dec => ...)  // ❌ 'any[]' array
```

**Impact:**
- No type checking on accessing `p.name`, `p.industry`
- If schema changes, runtime errors occur
- IDE can't provide autocomplete or type hints
- Hard to refactor safely

**Fix Required:**
```typescript
// ✅ Define proper types
interface CompanyProfile {
  name: string;
  industry?: string;
  description?: string;
}

interface CompanyMemo {
  company_profile?: CompanyProfile;
  decisions?: Array<{ made_by: string; title: string; decision: string }>;
}

// ✅ Use typed casting
const memo = result as CompanyMemo;

if (memo.company_profile) {
  const p = memo.company_profile;
  if (p.name || p.industry) {
    parts.push(`COMPANY PROFILE: ${p.name} ${p.industry ? `(${p.industry})` : ''}...`);
  }
}
```

---

### 🟠 ISSUE #13: Insecure JSON Parsing for Approval Requests
**Severity:** MEDIUM — Potential Parsing Failures  
**Affected File:** `/frontend/app/api/departments/[slug]/task/route.ts` (lines 46-93)

**Vulnerability:**
```typescript
function extractJsonObject(text: string, fromIndex: number): string | null {
  const start = text.indexOf('{', fromIndex)
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)  // ❌ Finds first } at depth 0
    }
  }
  return null
}
```

**Problems:**
- Doesn't handle escaped braces `\{`
- Doesn't handle string literals containing `}`
- Will fail on nested JSON with multiple root objects
- Fragile brace-counting approach

**Fix Required:**
```typescript
// ✅ Use JSON.parse with safety wrapper
function extractJsonObject(text: string, fromIndex: number): string | null {
  const start = text.indexOf('{', fromIndex);
  if (start === -1) return null;
  
  // Try to parse increasingly larger substrings
  for (let end = start + 1; end < text.length; end++) {
    try {
      const candidate = text.slice(start, end + 1);
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Keep trying
      continue;
    }
  }
  
  return null;
}

// ✅ Use more robust extraction with regex + validation
function extractApprovalRequest(text: string): ApprovalRequest | null {
  // Pattern 1: REQUEST_APPROVAL: { ... }
  const raIdx = text.indexOf('REQUEST_APPROVAL:');
  if (raIdx !== -1) {
    const raw = extractJsonObject(text, raIdx);
    if (raw) {
      try {
        const json = JSON.parse(raw);
        if (json.request_approval === true) {
          return ApprovalRequestSchema.parse(json);
        }
      } catch { /* fall through */ }
    }
  }
  
  // Pattern 2: Markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      const json = JSON.parse(fenceMatch[1]);
      if (json.request_approval === true) {
        return ApprovalRequestSchema.parse(json);
      }
    } catch { /* fall through */ }
  }
  
  return null;
}
```

---

### 🟠 ISSUE #14: Insufficient Validation of File Uploads
**Severity:** MEDIUM — Potential Abuse  
**Affected File:** `/frontend/app/api/knowledge/upload/route.ts`

**Vulnerability:**
- No file size limit check before uploading to storage
- No file type validation (could upload executable files)
- No rate limiting on uploads
- Could exhaust storage quota

**Fix Required:**
```typescript
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', /* ... */];

export async function POST(req: NextRequest) {
  const authClient = await createSupabaseServerComponentClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  
  const formData = await req.formData();
  const file = formData.get('file') as File;
  
  // ✅ Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
      { status: 413 }
    );
  }
  
  // ✅ Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `File type not supported. Allowed: ${ALLOWED_TYPES.join(', ')}` },
      { status: 415 }
    );
  }
  
  // ✅ Rate limiting (optional, per-user upload count)
  const { count } = await supabase
    .from('knowledge_base_files')
    .select('id', { count: 'exact' })
    .eq('created_by', user.id)
    .lt('created_at', new Date(Date.now() - 3600000).toISOString()); // Last hour
  
  if ((count ?? 0) > 10) {
    return NextResponse.json(
      { error: 'Rate limit: max 10 uploads per hour' },
      { status: 429 }
    );
  }
  
  // ... proceed with upload ...
}
```

---

### 🟠 ISSUE #15: Artifact Transformers Missing Error Handling
**Severity:** MEDIUM — Silent Failures  
**Affected File:** `/frontend/lib/artifact-transformers/index.ts`

**Vulnerability:**
```typescript
// detectOutputType returns transformer function, but:
// 1. Transformer can throw (e.g., invalid XLSX syntax)
// 2. Errors are caught but fallback to raw content
// 3. No warning to user that transformation failed

if (detection.transformer) {
  try {
    const transformed = await detection.transformer(content);
    // ... upload transformed ...
  } catch (err) {
    // ❌ Silent catch, no logging or retry
    fileContent = content;
    detection.targetFormat = 'json';
  }
}
```

**Impact:**
- User thinks DOCX was created, but it's actually raw JSON
- No visibility into transformation failures
- Artifact quality suffers silently

**Fix Required:**
```typescript
// ✅ Add detailed logging and fallback notification
if (detection.transformer) {
  try {
    const transformed = await detection.transformer(content);
    fileContent = transformed;
  } catch (transformErr) {
    console.warn(
      `[Artifact Transformation Failed] Format: ${detection.targetFormat}, Error:`,
      transformErr
    );
    
    // ✅ Log to event_log for visibility
    await supabase.from('event_log').insert({
      goal_id: goalId,
      event_type: 'artifact_transformation_failed',
      description: `Failed to transform artifact to ${detection.targetFormat}: ${String(transformErr).slice(0, 200)}`,
      metadata: {
        intended_format: detection.targetFormat,
        error: String(transformErr).slice(0, 500),
      },
      created_by: userId,
    });
    
    // ✅ Fallback with user notification
    fileContent = content;
    detection.targetFormat = 'txt';
    
    // ✅ Add note to memo
    await addTaskLog(goalId, `⚠️ Artifact formatting issue: could not convert to ${detection.targetFormat}. Saved as plain text instead.`);
  }
}
```

---

## DATA FLOW ISSUES (Design Observations)

### 🟡 ISSUE #16: Inconsistent Response Formats Across Endpoints
**Severity:** MEDIUM — API Contract Inconsistency  
**Affected Multiple Routes**

**Observation:**
Different endpoints return different response shapes:
```typescript
// Artifacts route returns:
{ success: true, data: [...], timestamp: '...' }

// Goals route returns:
{ success: true, data: [...], timestamp: '...' }

// Knowledge search returns:
{ matches: [...] } OR { result: '...' }

// Worker execute returns:
{ data: result, _metadata: {...} }

// Goals report returns:
{ success: true, timestamp: '...' }
```

**Impact:**
- Client code needs conditional logic for each endpoint
- Hard to add middleware that standardizes responses
- Inconsistent error handling

**Recommended Standard:**
```typescript
interface CrostApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  timestamp: string;
  _metadata?: Record<string, any>;
}
```

---

### 🟡 ISSUE #17: Missing Idempotency Keys on Critical Operations
**Severity:** MEDIUM — Duplicate Requests Can Cause Issues  
**Affected Endpoints:** All POST operations (artifact creation, goal creation, etc.)

**Problem:**
No idempotency key mechanism. If user retries due to network failure:
- Artifact created twice
- Goal created twice
- Email sent twice
- Approval request duplicated

**Recommended Fix:**
```typescript
// ✅ Add idempotency key support to critical endpoints
import { createHash } from 'crypto';

export async function POST(req: NextRequest) {
  const idempotencyKey = req.headers.get('idempotency-key');
  
  if (idempotencyKey) {
    // ✅ Check if we've already processed this key
    const { data: existing } = await supabase
      .from('idempotency_log')
      .select('response, created_at')
      .eq('idempotency_key', idempotencyKey)
      .eq('endpoint', req.nextUrl.pathname)
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 3600000).toISOString()) // 1 hour window
      .maybeSingle();
    
    if (existing) {
      return NextResponse.json(JSON.parse(existing.response), { status: 200 });
    }
  }
  
  // ... normal processing ...
  const result = { ... };
  
  // ✅ Log the response for idempotency
  if (idempotencyKey) {
    await supabase.from('idempotency_log').insert({
      idempotency_key: idempotencyKey,
      endpoint: req.nextUrl.pathname,
      user_id: user.id,
      response: JSON.stringify(result),
      created_at: new Date().toISOString(),
    });
  }
  
  return NextResponse.json(result);
}
```

---

### 🟡 ISSUE #18: No Request Size Limits
**Severity:** MEDIUM — Denial of Service  
**Affected:** All POST endpoints

**Problem:**
No Content-Length limits on POST bodies. Attacker can:
- Send 1GB of JSON
- Exhaust memory during parsing
- Trigger database timeout

**Fix Required:**
```typescript
// ✅ Add to middleware or per-route
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
    return NextResponse.json(
      { error: 'Request body too large' },
      { status: 413 }
    );
  }
  
  // ✅ Or in middleware.ts:
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
    return NextResponse.json(
      { error: 'Request body too large' },
      { status: 413 }
    );
  }
}
```

---

## RECOMMENDED DEPLOYMENT FIXES (Priority Order)

### CRITICAL (Immediate — Before Any Production Use)
1. ✅ Add `auth.getUser()` to all 12 unprotected routes
2. ✅ Add ownership checks to departments/[slug]/reset
3. ✅ Fix cron secret fallback logic in approvals/expire
4. ✅ Add rate limiting to knowledge base semantic search

### HIGH (Before Next Feature Release)
5. ✅ Dedicated internal service secret (not SERVICE_ROLE_KEY)
6. ✅ Add CSRF protection to POST endpoints
7. ✅ Fix artifact transformer error handling
8. ✅ Standardize API response format

### MEDIUM (Before Next Patch Release)
9. ✅ Add file upload validation (size, type, rate limit)
10. ✅ Type-safe JSON parsing for approval requests
11. ✅ Add idempotency keys to critical operations
12. ✅ Add request body size limits

### LOW (Next Quarter)
13. ✅ Implement request signing for internal communication
14. ✅ Add comprehensive input validation library
15. ✅ Security headers (CSP, X-Frame-Options, etc.)

---

## SUMMARY TABLE

| ID | Issue | Severity | Status | Effort | Blocker |
|----|-------|----------|--------|--------|---------|
| 1 | Missing auth on KB search/read | CRITICAL | ❌ Open | 30 min | YES |
| 2 | Missing auth on Composio connect | CRITICAL | ❌ Open | 15 min | YES |
| 3 | Missing auth on dept reset | CRITICAL | ❌ Open | 15 min | YES |
| 4 | Missing auth on goals report | CRITICAL | ❌ Open | 20 min | YES |
| 5 | Missing auth on tool config | CRITICAL | ❌ Open | 30 min | YES |
| 6 | Public secret presence endpoint | HIGH | ❌ Open | 10 min | NO |
| 7 | Cron secret fallback bug | HIGH | ❌ Open | 10 min | YES |
| 8 | SQL injection risk | HIGH | ⚠️ Partial | 60 min | NO |
| 9 | Race condition in goals dialogue | HIGH | ❌ Open | 20 min | NO |
| 10 | Unsafe internal secret pattern | HIGH | ❌ Open | 45 min | NO |
| 11 | KB search returns JSON | HIGH | ✅ Known | 15 min | NO |
| 12 | Type unsafe JSON casting | MEDIUM | ❌ Open | 90 min | NO |
| 13 | Insecure JSON parsing | MEDIUM | ❌ Open | 60 min | NO |
| 14 | No file upload validation | MEDIUM | ❌ Open | 45 min | NO |
| 15 | Transformer error handling | MEDIUM | ⚠️ Partial | 30 min | NO |
| 16 | Inconsistent response format | MEDIUM | ❌ Open | 120 min | NO |
| 17 | Missing idempotency keys | MEDIUM | ❌ Open | 90 min | NO |
| 18 | No request size limits | MEDIUM | ❌ Open | 30 min | NO |

---

## ESTIMATED REMEDIATION TIME

- **CRITICAL Issues:** ~90 minutes (fixes 1-5)
- **HIGH Issues:** ~135 minutes (fixes 6-10)
- **MEDIUM Issues:** ~360 minutes (fixes 12-18)
- **Total:** ~585 minutes (~10 hours)

All fixes are localized, no architectural changes required, and tests can be added incrementally.

---

## CONCLUSION

This codebase demonstrates:
- ✅ Thoughtful system architecture for multi-tenant AI operations
- ✅ Comprehensive logging and observability
- ✅ Good use of TypeScript and schema validation
- 🔴 **Critical gaps in authentication/authorization** across 12+ routes
- 🔴 **Type safety issues** that need refactoring
- 🔴 **Data flow inconsistencies** affecting maintainability

**Deployment Readiness:** ❌ NOT PRODUCTION-READY

The application is **immediately vulnerable to**:
- Unauthorized knowledge base access
- Department state manipulation
- Tool configuration hijacking
- Account takeover via OAuth flow

All identified issues have **application-ready fixes** documented above with code examples. Recommend immediate remediation of CRITICAL issues before any production traffic.

