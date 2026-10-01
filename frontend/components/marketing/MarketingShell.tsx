'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { CrostLogo } from './CrostLogo'
import { MARKETING_CSS, MARKETING_FONTS } from './styles'
import { MARKETING } from '@/lib/marketing-config'

type PageKey = 'home' | 'pricing' | 'privacy' | 'terms'

interface MarketingCtx {
  navigate: (p: PageKey) => void
  scrollTo: (id: string) => void
  showToast: (msg: string) => void
  count: number
  setCount: React.Dispatch<React.SetStateAction<number>>
}

const Ctx = createContext<MarketingCtx | null>(null)

export function useMarketing(): MarketingCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMarketing must be used inside <MarketingShell>')
  return v
}

// Reveal-on-scroll for .reveal / .reveal-left / .reveal-right / .reveal-scale
function useScrollReveal(key: string) {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )
    const scan = () => {
      document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach((node) => {
        if (!node.classList.contains('active')) observer.observe(node)
      })
    }
    scan()
    const timers = [50, 200, 500, 1000, 2000].map((ms) => setTimeout(scan, ms))
    return () => {
      timers.forEach(clearTimeout)
      observer.disconnect()
    }
  }, [key])
}

const EXTRA_CSS = `
a.nav-cta,a.btn-primary{text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
.nav-links a.nav-link,a.nav-logo{text-decoration:none}
a.nav-logo{color:var(--text)}
a.footer-link{text-decoration:none}
`

const PATHS: Record<PageKey, string> = { home: '/', pricing: '/pricing', privacy: '/privacy', terms: '/terms' }

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [count, setCount] = useState(0)

  useScrollReveal(pathname)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }, [])

  const navigate = useCallback(
    (p: PageKey) => {
      router.push(PATHS[p])
      window.scrollTo(0, 0)
      setMenuOpen(false)
    },
    [router]
  )

  const scrollTo = useCallback(
    (id: string) => {
      setMenuOpen(false)
      if (pathname !== '/') {
        router.push(`/#${id}`)
        return
      }
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    },
    [pathname, router]
  )

  const value = useMemo(() => ({ navigate, scrollTo, showToast, count, setCount }), [navigate, scrollTo, showToast, count])

  return (
    <Ctx.Provider value={value}>
      {/* A single string child: multiple text children hydrate as separate nodes and mismatch. */}
      <style dangerouslySetInnerHTML={{ __html: MARKETING_FONTS + MARKETING_CSS + EXTRA_CSS }} />

      <nav>
        <Link href="/" className="nav-logo" style={{ textDecoration: 'none' }}>
          <div className="nav-mark"><CrostLogo size={28} /></div>
          <span className="nav-name">Crost</span>
        </Link>
        <div className="nav-links">
          <span className="nav-link" onClick={() => scrollTo('features')}>Product</span>
          <Link href="/pricing" className="nav-link">Pricing</Link>
          <span className="nav-link" onClick={() => scrollTo('how')}>How it works</span>
          <Link href={MARKETING.loginHref} className="nav-link">Log in</Link>
          <Link href={MARKETING.ctaHref} className="nav-cta">{MARKETING.ctaLabel}</Link>
        </div>
        <button
          className={`mobile-menu-btn ${menuOpen ? 'active' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span></span><span></span><span></span>
        </button>
      </nav>

      <div className={`mobile-nav ${menuOpen ? 'active' : ''}`}>
        <span className="nav-link" onClick={() => scrollTo('features')}>Product</span>
        <Link href="/pricing" className="nav-link" onClick={() => setMenuOpen(false)}>Pricing</Link>
        <span className="nav-link" onClick={() => scrollTo('how')}>How it works</span>
        <Link href={MARKETING.loginHref} className="nav-link" onClick={() => setMenuOpen(false)}>Log in</Link>
        <Link href={MARKETING.ctaHref} className="nav-cta" style={{ width: '100%' }}>{MARKETING.ctaLabel}</Link>
      </div>

      {children}

      <footer>
        <div className="footer-logo">
          <div className="footer-mark"><CrostLogo size={22} /></div>
          <span className="footer-name">Crost</span>
        </div>
        <div className="footer-copy mono">© {new Date().getFullYear()} Crost. All rights reserved.</div>
        <div className="footer-links">
          <Link href="/pricing" className="footer-link">Pricing</Link>
          <Link href="/privacy" className="footer-link">Privacy</Link>
          <Link href="/terms" className="footer-link">Terms</Link>
          <a href="mailto:hello@crosthq.com" className="footer-link">Contact</a>
        </div>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </Ctx.Provider>
  )
}
