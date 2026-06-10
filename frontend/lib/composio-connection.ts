import { createServerSupabaseClient } from '@/lib/supabase'

const GOOGLE_SERVICES = new Set([
  'gmail', 'googlecalendar', 'googlesheets', 'googledrive',
  'google', 'calendar', 'sheets', 'drive',
])

/**
 * Checks if a service is connected for a user.
 * Google services are always considered connected when Firebase Google OAuth is active.
 * Other services are checked against the connections table.
 */
export async function checkConnectionWithJIT(
  userId: string,
  service: string,
): Promise<{ isConnected: boolean; error?: string }> {
  const serviceLower = service.toLowerCase()

  // Google services: connected via Firebase Google OAuth (no separate connection record needed)
  if (GOOGLE_SERVICES.has(serviceLower) || serviceLower.startsWith('google')) {
    return { isConnected: true }
  }

  // Other services: check connections table
  const supabase = createServerSupabaseClient()
  const { data: connection, error: connErr } = await supabase
    .from('connections')
    .select('service_name')
    .eq('created_by', userId)
    .eq('service_name', serviceLower)
    .maybeSingle()

  if (!connErr && connection) {
    return { isConnected: true }
  }

  return {
    isConnected: false,
    error: `${service.toUpperCase()} is not connected. Visit Settings → Integrations to connect.`,
  }
}
