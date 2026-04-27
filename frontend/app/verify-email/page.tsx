
'use client'

import { Logo } from '@/components/ui/Logo'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email')

  return (
    <main className="login-root">
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="logo-wrapper">
              <Logo size={54} />
            </div>
            <h1 className="login-heading">Verify your email</h1>
            <p className="login-subheading">
              We&apos;ve sent a verification link to {email ? <strong>{email}</strong> : 'your email'}.
            </p>
          </div>

          <div className="auth-flow" style={{ textAlign: 'center', gap: '2rem' }}>
            <div className="sent-icon" style={{ fontSize: '3rem', marginBottom: '1rem' }}>✉️</div>
            <p style={{ color: 'var(--foreground-muted, #888)', lineHeight: '1.6' }}>
              Please check your inbox and click the link to activate your account. 
              Once verified, you can continue to your dashboard.
            </p>

            <div className="bottom-links" style={{ marginTop: '1rem' }}>
              <Link href="/login" className="login-button" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Back to Sign In
              </Link>
            </div>
          </div>
        </div>
        
        <footer className="login-footer">
          &copy; 2026 Crost Intelligence Architecture v2.0
        </footer>
      </div>
    </main>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <main className="login-root">
        <div className="login-container">
          <div className="login-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
            <div className="loading-spinner" />
          </div>
        </div>
      </main>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
