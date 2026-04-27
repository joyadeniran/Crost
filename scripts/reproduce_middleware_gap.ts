
// Mocking some Next.js and Supabase types/functions for testing
const ONBOARDING_ROUTES = [
  '/onboarding/identity',
  '/onboarding/control',
  '/onboarding/orc',
  '/onboarding/team',
  '/onboarding/activate',
];

function getOnboardingTarget(step?: string | null) {
  if (step === 'complete') return '/dashboard';
  if (step === 'activated') return '/onboarding/activate';
  if (step === 'team') return '/onboarding/team'
  if (step === 'orc') return '/onboarding/orc'
  if (step === 'control') return '/onboarding/control'
  return '/onboarding/identity'
}

function getRouteRank(pathname: string) {
  return ONBOARDING_ROUTES.findIndex((route) => pathname.startsWith(route))
}

// The core logic from middleware.ts adapted for testing
async function testMiddleware(pathname: string, user: any) {
  // Logic from middleware.ts after fix
  const isUnverifiedEmailUser = user && user.app_metadata?.provider === 'email' && !user.email_confirmed_at;
  
  if (isUnverifiedEmailUser) {
    const isAllowedPage = pathname === '/login' || 
                         pathname === '/signup' || 
                         pathname === '/verify-email' ||
                         pathname.startsWith('/auth')
    
    if (!isAllowedPage) {
        return { status: 'redirected', to: `/verify-email${user.email ? `?email=${user.email}` : ''}` };
    }
    // If they are on an allowed page, stay there.
    return { status: 'allowed' };
  }

  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      return { status: 'redirected', to: '/login' };
    }
  }

  // Redirect away from Login/Onboarding if complete
  if (pathname === '/login' || pathname.startsWith('/onboarding') || pathname === '/signup') {
    if (user) {
       const step = user.user_metadata?.onboarding_step
       const onboardingComplete = step === 'complete'
       if (onboardingComplete) {
         return { status: 'redirected', to: '/dashboard' }
       }

       const target = getOnboardingTarget(step)

       if (pathname === '/login' || pathname === '/signup') {
         return { status: 'redirected', to: target }
       }

       if (pathname.startsWith('/onboarding')) {
         const requestedRank = getRouteRank(pathname)
         const maxAllowedRank = getRouteRank(target)

         if (requestedRank > maxAllowedRank) {
           return { status: 'redirected', to: target }
         }
       }
    }
  }

  return { status: 'allowed' };
}

async function runTests() {
  console.log('Verifying Fixed Middleware Security Gap...');

  const unverifiedUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    app_metadata: { provider: 'email' },
    email_confirmed_at: null,
    user_metadata: {}
  };

  const verifiedUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    app_metadata: { provider: 'email' },
    email_confirmed_at: '2024-01-01T00:00:00Z',
    user_metadata: {}
  };

  // Test Case 1: Unverified user accessing dashboard
  const res1 = await testMiddleware('/dashboard', unverifiedUser);
  console.log('Test 1 (Unverified -> /dashboard):', res1);
  if (res1.status !== 'redirected' || !res1.to?.includes('/verify-email')) {
    console.error('FAIL: Unverified user should be redirected to /verify-email');
  }

  // Test Case 2: Unverified user accessing onboarding
  const res2 = await testMiddleware('/onboarding/identity', unverifiedUser);
  console.log('Test 2 (Unverified -> /onboarding/identity):', res2);
  if (res2.status !== 'redirected' || !res2.to?.includes('/verify-email')) {
    console.error('FAIL: Unverified user should be redirected to /verify-email');
  }

  // Test Case 3: Verified user accessing onboarding
  const res3 = await testMiddleware('/onboarding/identity', verifiedUser);
  console.log('Test 3 (Verified -> /onboarding/identity):', res3);
  if (res3.status !== 'allowed') {
    console.error('FAIL: Verified user should be allowed to access onboarding');
  }

  // Test Case 4: Unverified user on login page
  const res4 = await testMiddleware('/login', unverifiedUser);
  console.log('Test 4 (Unverified -> /login):', res4);
  if (res4.status !== 'allowed') {
      console.error('FAIL: Unverified user should be allowed to stay on /login');
  }

  // Test Case 5: Unverified user on verify-email page
  const res5 = await testMiddleware('/verify-email', unverifiedUser);
  console.log('Test 5 (Unverified -> /verify-email):', res5);
  if (res5.status !== 'allowed') {
      console.error('FAIL: Unverified user should be allowed to stay on /verify-email');
  }

  console.log('Tests completed.');
}

runTests().catch(console.error);
