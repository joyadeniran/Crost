# Fix: Departments Not Loading on Team Onboarding Page

## Issue
The `/onboarding/team` page was showing "Finding suitable agents..." but departments never loaded. The page made a request to `GET /api/departments?scope=templates&active_only=true` which returned **401 Unauthorized**.

## Root Cause
The `/api/departments` endpoint was checking for user authentication on ALL requests:

```typescript
const authClient = await createSupabaseServerComponentClient()
const { data: { user } } = await authClient.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
```

However, when users are on the `/onboarding/team` page, **they haven't completed authentication yet** - they're still in the onboarding flow. The authentication cookies may not be properly set, or the session isn't established until later in the flow.

## The Fix
Modified the endpoint to allow **unauthenticated access specifically for template departments** (`scope=templates`). This makes sense because:

1. **Template departments are public data**: They're seed data (`created_by IS NULL`) that any user should be able to browse
2. **Onboarding users aren't authenticated yet**: The onboarding flow happens before the user completes authentication
3. **User departments still require auth**: When requesting user-specific departments (`scope=user` or `scope=all`), authentication is still required

### Code Changes in `/app/api/departments/route.ts`:

**Before:**
```typescript
export async function GET(req: NextRequest) {
  try {
    // Auth check FIRST - blocks everything
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    
    // ... rest of logic
  }
}
```

**After:**
```typescript
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const scope = searchParams.get('scope') ?? 'default'
    
    // For template browsing (during onboarding), allow unauthenticated access
    if (scope === 'templates') {
      let query = supabase
        .from('departments')
        .select('*')
        .is('created_by', null) // Only templates
        .neq('activation_stage', 'deprecated')
      // ... fetch and return
    }

    // For user departments, require authentication
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    
    // ... rest of logic
  }
}
```

## Impact
- ✅ `/onboarding/team` page can now fetch template departments
- ✅ Users see the department selection grid during onboarding
- ✅ User-specific departments still require authentication (no data leaks)
- ✅ The "scope" parameter design is honored (templates = public, others = authenticated)

## Testing
1. Navigate to `/onboarding/team`
2. Verify departments now load (no more "Finding suitable agents..." state)
3. Confirm you can select 2-3 departments
4. Verify "Start with these" button becomes enabled

## Security Notes
- Template departments are public seed data (available to anyone)
- No sensitive user data is exposed
- User-specific departments still require proper authentication
- The `is('created_by', null)` filter ensures only templates are returned in unauthenticated requests
