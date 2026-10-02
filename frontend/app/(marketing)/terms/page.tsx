import type { Metadata } from 'next'
import { TermsPage } from '@/components/marketing/LegalPages'

export const metadata: Metadata = {
  title: 'Terms of Service | Crost',
  description: "Read Crost's terms of service. Understand your rights and responsibilities when using our platform.",
  alternates: { canonical: '/terms' },
}

export default function Page() {
  return <TermsPage />
}
