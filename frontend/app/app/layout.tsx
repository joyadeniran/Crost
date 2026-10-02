import '../../styles/fonts.css'
import '../globals.css'
import { Toaster } from '@/components/ui/toaster'

// Everything under /app — product styles + toasts. Auth (middleware) lives in
// middleware.ts; the shell/onboarding layouts sit below this one.
export default function AppRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-dm-sans antialiased">
      {children}
      <Toaster />
    </div>
  )
}
