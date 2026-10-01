import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Crost — Your Agentic Office',
  description: 'The Agentic Operating System for solo founders',
  icons: { icon: '/icon.png' },
}

// Intentionally minimal: the marketing site and the product have separate
// stylesheets, loaded by their own layouts ((marketing) / (product) / app/app).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
