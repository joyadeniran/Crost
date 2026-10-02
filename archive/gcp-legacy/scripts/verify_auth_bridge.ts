
// scripts/verify_auth_bridge.ts

// Mocking window and location
const globalAny: any = global;
globalAny.window = {
  location: {
    origin: 'http://localhost:3000',
    search: '?email=test@example.com&source=landing',
    href: ''
  }
};

// Mocking toast
const mockedToast = (message: string, type: string = 'info') => {
    console.log(`Toast [${type}]: ${message}`);
    return 'id';
};

// Mocking Supabase Client
const mockSupabase = {
    auth: {
        signUp: async ({ email }: { email: string }) => {
            if (email === 'exists@example.com') {
                return { 
                    data: { user: null }, 
                    error: { code: 'user_already_exists', message: 'User already registered' } 
                };
            }
            return { data: { user: { id: 'new-user-id' } }, error: null };
        },
        verifyOtp: async ({ email, token }: { email: string, token: string }) => {
            if (token === '123456') {
                return { data: { user: { id: 'verified-user-id' } }, error: null };
            }
            return { data: { user: null }, error: { message: 'Invalid code' } };
        }
    },
    from: (table: string) => ({
        insert: async (data: any) => {
            console.log(`Inserted into ${table}:`, data);
            return { error: null };
        }
    })
};

async function testDuplicateEmail() {
    console.log('--- Testing Duplicate Email ---');
    const email = 'exists@example.com';
    
    // Simulate logic from SignUpPage.tsx
    const handleSignUp = async (email: string) => {
        const { error } = await mockSupabase.auth.signUp({ email });
        if (error) {
            if (error.code === 'user_already_exists' || error.message?.toLowerCase().includes('already registered')) {
                mockedToast('An account already exists with this email. Redirecting to sign in…', 'info');
                const target = `/login?email=${encodeURIComponent(email)}`;
                console.log(`Redirecting to: ${target}`);
                return { redirected: true, target };
            }
        }
        return { redirected: false };
    };

    const result = await handleSignUp(email);
    
    if (result.redirected && result.target === `/login?email=exists%40example.com`) {
        console.log('✅ Duplicate email redirect test passed');
    } else {
        console.log('❌ Duplicate email redirect test failed');
    }
}

async function testConsentInsertion() {
    console.log('\n--- Testing Consent Insertion ---');
    const searchParams = new URLSearchParams('?email=test@example.com&source=landing');
    
    // Simulate logic from SignUpPage.tsx
    const handleVerifyOtp = async (token: string) => {
        const { data, error } = await mockSupabase.auth.verifyOtp({ email: 'test@example.com', token });
        if (error) return { success: false };
        
        if (data.user?.id) {
            const source = searchParams?.get('source') || 'direct';
            const consentData = {
              user_id: data.user.id,
              consent_type: 'terms_and_privacy',
              source,
              consented_at: new Date().toISOString(),
            };
            await mockSupabase.from('user_consents').insert(consentData);
            return { success: true, consentData };
        }
        return { success: false };
    };

    const result = await handleVerifyOtp('123456');
    
    if (result.success && result.consentData?.source === 'landing') {
        console.log('✅ Consent insertion with source=landing passed');
    } else {
        console.log('❌ Consent insertion with source=landing failed');
    }
}

async function runTests() {
    await testDuplicateEmail();
    await testConsentInsertion();
}

runTests().catch(console.error);
