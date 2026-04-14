# Departments Not Loading on Team Onboarding Page

## Issue Summary
The `/onboarding/team` page shows a loading state ("Finding suitable agents...") but departments never appear. The issue is a **401 Unauthorized** error when calling `GET /api/departments?scope=templates&active_only=true`.

## Root Cause Analysis

### What's Happening:
1. **Client makes request**: `page.tsx` (line 24) calls `fetch('/api/departments?scope=templates&active_only=true')`
2. **API route receives request**: `/api/departments/route.ts` handles the request
3. **Auth check fails**: Line 13-15 calls `createSupabaseServerComponentClient()` and `getUser()` returns `null`
4. **Result**: API returns 401 Unauthorized, preventing departments from loading

### Why Authentication Fails:

The `createSupabaseServerComponentClient()` in `lib/supabase.ts` (lines 34-64) reads cookies from the request to establish the user session:

```typescript
export async function createSupabaseServerComponentClient() {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()  // ← Reads cookies here
      },
      // ...
    }
  })
}
```

**The problem:** When called from an API route handler, `cookies()` reads from `next/headers`, but this may not work correctly in all contexts, especially if:

1. **Cookies not properly set by middleware**: The middleware (`middleware.ts`) is supposed to set the authentication cookies, but there might be an issue with cookie propagation
2. **Cookie domain/path mismatch**: If the onboarding domain doesn't match where cookies are set
3. **Session not established**: The user hasn't completed authentication yet (they're on the onboarding flow, not yet fully logged in)

## Potential Solutions

### Option 1: Pass Auth Token in Request Header (Recommended for Client Components)
Instead of relying on cookies, the client-side code could pass the auth token in the Authorization header:

```typescript
// In page.tsx
const res = await fetch('/api/departments?scope=templates&active_only=true', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
})
```

### Option 2: Allow Unauthenticated Access to Template Departments
Modify the API route to allow unauthenticated access specifically when fetching template departments (scope=templates):

```typescript
// In route.ts
const { data: { user } } = await authClient.auth.getUser()
const scope = searchParams.get('scope') ?? 'default'

// Allow unauthenticated access only for template browsing
if (scope !== 'templates' && !user) {
  return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
}
```

### Option 3: Debug Cookie Propagation
Add logging to understand what cookies are being sent:

```typescript
// In route.ts - add debug logging
const { cookies } = await import('next/headers')
const cookieStore = await cookies()
console.log('[DEBUG] Cookies in route:', cookieStore.getAll())

const authClient = await createSupabaseServerComponentClient()
const { data: { user } } = await authClient.auth.getUser()
console.log('[DEBUG] Authenticated user:', user?.id)
```

## Key Files Involved
- `/app/onboarding/team/page.tsx` - Client component making the fetch request
- `/app/api/departments/route.ts` - API endpoint checking authentication
- `/lib/supabase.ts` - Supabase client initialization  
- `/middleware.ts` - Session cookie setting and refresh

## Next Steps
1. **Check middleware logs**: Verify cookies are being set properly by middleware
2. **Test with Option 2**: Temporarily allow unauthenticated template access to confirm auth is the issue
3. **Implement Option 1**: Use auth token header for better security and reliability
4. **Add debugging**: Use the logging suggestions above to trace cookie/auth flow
