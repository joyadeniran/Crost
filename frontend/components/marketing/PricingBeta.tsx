'use client'

import Link from 'next/link'
import { MARKETING } from '@/lib/marketing-config'

// Beta pricing: the product is free while in beta and there is no billing in
// the app yet, so this page says exactly that and nothing about unbuilt tiers.

const INCLUDED = [
  'Orc, your AI chief of staff: one goal in, a 3–5 task plan out',
  'Four departments: Marketing, Sales, Operations, Engineering',
  'Approval gate on every external action — nothing sends without you',
  'Artifacts (documents, spreadsheets, decks) with versioned "Make changes"',
  'Company memos and a full activity log',
  'Gmail send on approval (connect your Google account)',
]

const FAQ = [
  { q: 'Is Crost really free?', a: 'Yes — during the beta there is no charge and no card is needed. Fair-use limits on AI usage apply per account, and you can see your daily usage in the app.' },
  { q: 'Will it stay free?', a: 'We plan to introduce paid plans after the beta. Beta users will get notice well before anything changes, and nothing is billed automatically.' },
  { q: 'What happens to my data if the beta changes?', a: 'Your workspace data stays yours. You can request deletion any time at privacy@crosthq.com.' },
  { q: 'Can my team use it?', a: 'The beta is built for solo founders — one account, one workspace. Team workspaces are not available yet.' },
]

export function PricingBeta() {
  return (
    <main className="pricing-beta" style={{ maxWidth: 920, margin: '0 auto', padding: '140px 24px 80px' }}>
      <div className="section-label mono">Pricing</div>
      <h1 className="serif" style={{ fontSize: 'clamp(36px,6vw,64px)', lineHeight: 1.05, margin: '12px 0 16px', fontWeight: 400 }}>
        Free during the <em style={{ color: 'var(--accent)' }}>beta.</em>
      </h1>
      <p style={{ color: 'var(--text2)', maxWidth: 620, marginBottom: 40 }}>
        Everything below is included. No card, no trial clock. We&apos;ll announce paid plans before they exist, not after.
      </p>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 16, padding: 'clamp(24px,4vw,40px)' }}>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, letterSpacing: '.1em' }}>BETA ACCESS</div>
        <div className="serif" style={{ fontSize: 48, margin: '8px 0 20px' }}>$0</div>
        <ul style={{ listStyle: 'none', display: 'grid', gap: 12, marginBottom: 28 }}>
          {INCLUDED.map((f) => (
            <li key={f} style={{ display: 'flex', gap: 10, color: 'var(--text)' }}>
              <span style={{ color: 'var(--accent)' }}>→</span><span>{f}</span>
            </li>
          ))}
        </ul>
        <Link href={MARKETING.ctaHref} className="btn-primary">{MARKETING.ctaLabel} →</Link>
      </div>

      <h2 className="serif" style={{ fontSize: 28, fontWeight: 400, margin: '64px 0 16px' }}>Questions</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {FAQ.map((f) => (
          <details key={f.q} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 500 }}>{f.q}</summary>
            <p style={{ color: 'var(--text2)', marginTop: 10 }}>{f.a}</p>
          </details>
        ))}
      </div>
    </main>
  )
}
