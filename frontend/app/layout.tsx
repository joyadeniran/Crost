import type { Metadata } from 'next'
import '../styles/fonts.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Crost — Your Agentic Office',
  description: 'The Agentic Operating System for solo founders',
}

import { Toaster } from '@/components/ui/toaster'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-dm-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
