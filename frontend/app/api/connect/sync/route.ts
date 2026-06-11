import { createSupabaseServerComponentClient, createServerSupabaseClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic'

// Native Google integrations Crost can actually execute (no third-party broker).
// Gmail send is wired end-to-end; the others are connectable via the same Google
// OAuth grant and execute as they are wired up.
const GOOGLE_TOOLKITS: Array<{ id: string; label: string; description: string }> = [
  { id: 'gmail', label: 'Gmail', description: 'Send and manage email from your Google account' },
  { id: 'googlecalendar', label: 'Google Calendar', description: 'Create and manage calendar events' },
  { id: 'googledrive', label: 'Google Drive', description: 'Read and store files in Drive' },
  { id: 'googlesheets', label: 'Google Sheets', description: 'Read and update spreadsheets' },
]

/**
 * GET /api/connect/sync
 * Returns the connectable tool catalog with per-user connection status derived
 * from the `connections` table. Connection happens via Google sign-in
 * (gmail.send / calendar scopes) — see /api/connect/google.
 */
export async function GET() {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const supabase = createServerSupabaseClient();

    const { data: activeConnections } = await supabase
      .from('connections')
      .select('service_name')
      .eq('created_by', user.id)

    const connected = new Set(
      (activeConnections ?? []).map((c: { service_name: string }) => c.service_name.toLowerCase())
    )
    // A Google OAuth grant (service_name 'google') covers all Google toolkits.
    const hasGoogle = connected.has('google')

    const tools = GOOGLE_TOOLKITS.map((tk) => ({
      id: tk.id,
      label: tk.label,
      description: tk.description,
      is_configured: hasGoogle || connected.has(tk.id),
      requires_config: true,
      risk_level: 'medium',
      is_action: false,
    }))

    return NextResponse.json({ success: true, tools, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error("[Sync Error]:", error);
    return NextResponse.json({ error: error.message || "Synchronization failed" }, { status: 500 });
  }
}
