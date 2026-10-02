import type { Metadata } from 'next'
import { MarketingShell } from '@/components/marketing/MarketingShell'

export const metadata: Metadata = {
  metadataBase: new URL('https://crosthq.com'),
  openGraph: { siteName: 'Crost', type: 'website', images: ['/og-image.png'] },
  twitter: { card: 'summary_large_image' },
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>
}
