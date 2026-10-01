import type { Metadata } from 'next'
import BridgeScroll from '@/components/marketing/BridgeScroll'
import { HomeSections } from '@/components/marketing/HomeSections'

const TITLE = 'Crost — Agentic OS for Solo Founders'
const DESCRIPTION =
  'Your AI office. Four departments, one chief of staff. Crost turns goals into plans, coordinates your team, and executes — while you stay in control.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/' },
  twitter: { title: TITLE, description: DESCRIPTION },
}

export default function HomePage() {
  return (
    <>
      <BridgeScroll />
      <HomeSections />
    </>
  )
}
