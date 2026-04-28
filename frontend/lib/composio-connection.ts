import { createServerSupabaseClient } from "@/lib/supabase";

/**
 * Checks if a service is connected for a user, with Just-In-Time (JIT) synchronization
 * from Composio if the local database record is missing or stale.
 */
export async function checkConnectionWithJIT(userId: string, service: string): Promise<{ isConnected: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();
  const serviceLower = service.toLowerCase();

  // 1. Check local DB first
  const { data: connection, error: connErr } = await supabase
    .from("connections")
    .select("*")
    .eq("created_by", userId)
    .eq("service_name", serviceLower)
    .maybeSingle();

  // If we found a record, it's connected (this table doesn't use a status column)
  if (!connErr && connection) {
    return { isConnected: true };
  }

  // 2. JIT Sync: Check Composio directly
  try {
    if (!process.env.COMPOSIO_API_KEY) {
      console.warn("[JIT Sync] COMPOSIO_API_KEY is missing");
      return { isConnected: false, error: "Composio API key is not configured" };
    }

    const { Composio } = await import("@composio/core");
    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
    const session = await composio.create(userId);
    const toolkitsResult = await session.toolkits();
    const toolkits = (toolkitsResult as any).items || [];
    
    // Find toolkit by name (case-insensitive)
    const toolkit = toolkits.find((t: any) => t.name.toLowerCase() === serviceLower);
    const isConnected = toolkit?.connection?.isActive ?? false;

    if (isConnected) {
      // Heal the DB record for connections
      await supabase.from("connections").upsert({
        created_by: userId,
        service_name: serviceLower,
        connection_id: toolkit.connection.connectedAccount?.id || 'managed',
        updated_at: new Date().toISOString()
      }, { onConflict: 'created_by, service_name' });

      // Heal available_tools too (the toolkit and its actions)
      await supabase.from("available_tools").update({ is_configured: true })
        .eq("user_id", userId)
        .or(`id.eq.${serviceLower},id.like.${serviceLower}_%`);
        
      console.log(`[JIT Sync] Healed connection for ${serviceLower} for user ${userId}`);
      return { isConnected: true };
    }
  } catch (jitErr: any) {
    console.error("[JIT Sync Failed]", jitErr);
    // Fall through to failure
  }

  return { 
    isConnected: false, 
    error: `${service.toUpperCase()} is not connected. Connect it in Settings → Integrations, then retry.` 
  };
}
