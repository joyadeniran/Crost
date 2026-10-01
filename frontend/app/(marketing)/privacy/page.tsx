import type { Metadata } from 'next'
import { PrivacyPage } from '@/components/marketing/LegalPages'

export const metadata: Metadata = {
  title: 'Privacy Policy | Crost',
  description: "Read Crost's privacy policy. We're committed to protecting your data and being transparent about how we use it.",
  alternates: { canonical: '/privacy' },
}

export default function Page() {
  return <PrivacyPage />
}
