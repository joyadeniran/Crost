import type { Metadata } from 'next'
import { PricingBeta } from '@/components/marketing/PricingBeta'

const DESCRIPTION = 'Crost is free during the beta. Everything is included — no card needed.'

export const metadata: Metadata = {
  title: 'Pricing | Crost',
  description: DESCRIPTION,
  alternates: { canonical: '/pricing' },
  openGraph: { title: 'Pricing | Crost', description: DESCRIPTION, url: '/pricing' },
}

export default function PricingPage() {
  return <PricingBeta />
}
