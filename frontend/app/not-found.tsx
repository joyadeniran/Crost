import Link from 'next/link'
import { MarketingShell } from '@/components/marketing/MarketingShell'

export const metadata = { title: '404 — Page Not Found | Crost', robots: { index: false } }

export default function NotFound() {
  return (
    <MarketingShell>
      <div className="not-found-container">
        <div className="not-found-content">
          <h1 className="not-found-title">404</h1>
          <h2 className="not-found-subtitle">Page Not Found</h2>
          <p className="not-found-description">
            Sorry, the page you&apos;re looking for doesn&apos;t exist. It might have been moved or deleted.
          </p>
          <div className="not-found-actions">
            <Link href="/" className="btn-primary">Return to Home</Link>
            <div className="not-found-links">
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/pricing">Pricing</Link>
            </div>
          </div>
        </div>
      </div>
    </MarketingShell>
  )
}
