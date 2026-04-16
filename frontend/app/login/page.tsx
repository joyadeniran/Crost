'use client'

import { useState } from 'react'
import { supabaseClient } from '@/lib/supabase-browser'
import { Logo } from '@/components/ui/Logo'
import { toast } from '@/components/ui/toaster'
import Link from 'next/link'



export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [showOtp, setShowOtp] = useState(false)
  const [mode, setMode] = useState<'magic-link' | 'password'>('magic-link')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'magic-link') {
        const { error } = await supabaseClient.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        })
        if (error) throw error
        setShowOtp(true)
        toast('Magic link and code sent!', 'success')
      } else {
        const { error } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        window.location.href = '/dashboard'
      }
    } catch (err: any) {
      toast(err.message || 'Authentication failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = await supabaseClient.auth.verifyOtp({
        email,
        token: otp,
        type: 'magiclink'
      })
      if (error) throw error
      window.location.href = '/dashboard'
    } catch (err: any) {
      toast(err.message || 'Invalid code', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
    } catch (err: any) {
      toast(err.message || 'Social login failed', 'error')
    }
  }

  return (
    <main className="login-root">
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="logo-wrapper">
              <Logo size={54} />
            </div>
            <h1 className="login-heading">Sign in to Crost</h1>
            <p className="login-subheading">Your Agentic Office is one click away.</p>
          </div>

          {!showOtp ? (
            <div className="auth-flow">
              <form onSubmit={handleLogin} className="login-form">
                <div className="input-group">
                  <label className="input-label">Founder Email</label>
                  <input
                    type="email"
                    className="login-input"
                    placeholder="founder@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {mode === 'password' && (
                  <div className="input-group animate-slide-in">
                    <label className="input-label">Password</label>
                    <input
                      type="password"
                      className="login-input"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                )}

                <button 
                  type="submit" 
                  className="login-button" 
                  disabled={loading}
                >
                  {loading ? (
                    <span className="spinner"></span>
                  ) : (
                    mode === 'magic-link' ? 'Send Magic Link' : 'Sign In with Password'
                  )}
                </button>
              </form>

              <div className="divider">
                <span>OR</span>
              </div>

              <div className="social-login">
                <button onClick={() => handleSocialLogin('google')} className="social-btn" title="Sign in with Google">
                  <GoogleIcon />
                </button>
                <button onClick={() => handleSocialLogin('apple')} className="social-btn" title="Sign in with Apple">
                  <AppleIcon />
                </button>
              </div>

              <div className="bottom-links">
                <button
                  type="button"
                  onClick={() => setMode(mode === 'magic-link' ? 'password' : 'magic-link')}
                  className="secondary-button"
                >
                  {mode === 'magic-link' ? 'Use password instead' : 'Use magic link instead'}
                </button>
                <div className="signup-prompt">
                  New to Crost? <Link href="/signup" style={{ color: '#00D4AA', textDecoration: 'none', fontWeight: 600 }}>Create an account</Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="otp-state animate-fade-in">
              <div className="sent-icon">✉️</div>
              <h2 className="sent-title">Check your inbox</h2>
              <p className="sent-desc">
                We&apos;ve sent a magic code to <strong style={{ color: 'var(--accent, #00D4AA)' }}>{email}</strong>.
              </p>
              
              <form onSubmit={handleVerifyOtp} className="otp-form">
                <div className="input-group">
                  <label className="input-label">6-Digit Code</label>
                  <input
                    type="text"
                    className="login-input otp-input"
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    maxLength={6}
                    required
                    autoFocus
                  />
                </div>
                <button type="submit" className="login-button" disabled={loading}>
                  {loading ? <span className="spinner"></span> : 'Verify Code & Sign In'}
                </button>
              </form>

              <div className="sent-hint">
                You can also click the link in the email to sign in instantly.
              </div>
              <button 
                onClick={() => setShowOtp(false)} 
                className="secondary-button"
              >
                ← Back to sign in
              </button>
            </div>
          )}
        </div>
        
        <footer className="login-footer">
          &copy; 2026 Crost Intelligence Architecture v2.0
        </footer>
      </div>


    </main>
  )
}

// Custom SVGs for Social Login (Unchanged)
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.05 20.28c-.96.95-2.12 2.21-3.6 2.22-1.45.01-1.93-.89-3.62-.89-1.68 0-2.2.87-3.6.89-1.44.02-2.77-1.42-3.74-2.82C.5 16.78-1 11.23 1.04 7.54c1.02-1.84 2.92-3 4.98-3.03 1.56-.02 3.03 1.06 3.99 1.06.94 0 2.76-1.3 4.63-1.11.79.03 3.02.32 4.45 2.41-.11.07-2.67 1.55-2.64 4.63.03 3.73 3.25 4.92 3.29 4.94-.03.08-.52 1.78-1.69 3.48zM13.9 3.19c.84-1.02 1.4-2.45 1.25-3.87-1.22.05-2.69.81-3.57 1.84-.79.91-1.48 2.37-1.29 3.76 1.36.11 2.73-.66 3.61-1.73z"/>
  </svg>
)
