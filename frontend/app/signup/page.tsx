'use client'

import { useState } from 'react'
import { supabaseClient } from '@/lib/supabase-browser'
import { Logo } from '@/components/ui/Logo'
import { toast } from '@/components/ui/toaster'
import Link from 'next/link'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [showOtp, setShowOtp] = useState(false)

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/onboarding/identity`,
        },
      })
      if (error) throw error
      setShowOtp(true)
      toast('Verification code sent!', 'success')
    } catch (err: any) {
      toast(err.message || 'Signup failed', 'error')
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
        type: 'signup'
      })
      if (error) throw error
      window.location.href = '/onboarding/identity'
    } catch (err: any) {
      toast(err.message || 'Invalid code', 'error')
    } finally {
      setLoading(false)
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
            <h1 className="login-heading">Create your Office</h1>
            <p className="login-subheading">Build your agentic team in minutes.</p>
          </div>

          {!showOtp ? (
            <div className="auth-flow">
              <form onSubmit={handleSignUp} className="login-form">
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

                <div className="input-group">
                  <label className="input-label">Choose Password</label>
                  <input
                    type="password"
                    className="login-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <button 
                  type="submit" 
                  className="login-button" 
                  disabled={loading}
                >
                  {loading ? <span className="spinner"></span> : 'Initialize Crost →'}
                </button>
              </form>

              <div className="mode-switch">
                <p className="switch-text">
                  Already have an account?{' '}
                  <Link href="/login" style={{ color: '#00D4AA', textDecoration: 'none', fontWeight: 600 }}>Sign in</Link>
                </p>
              </div>
            </div>
          ) : (
            <div className="otp-state animate-fade-in">
              <div className="sent-icon">🚀</div>
              <h2 className="sent-title">Verification Sent</h2>
              <p className="sent-desc">
                We&apos;ve sent a verification code to <strong style={{ color: 'var(--accent, #00D4AA)' }}>{email}</strong>.
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
                  {loading ? <span className="spinner"></span> : 'Verify & Activate'}
                </button>
              </form>

              <div className="sent-hint">
                Enter the code from your email to start your activation.
              </div>
              <button 
                onClick={() => setShowOtp(false)} 
                className="secondary-button"
              >
                ← Back to signup
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
