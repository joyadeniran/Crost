import '../../styles/fonts.css'
import '../globals.css'
import { Toaster } from '@/components/ui/toaster'

// Auth pages (login / signup / verify-email) — product styles + toasts.
export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-dm-sans antialiased">
      {children}
      <Toaster />
    </div>
  )
}
