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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
