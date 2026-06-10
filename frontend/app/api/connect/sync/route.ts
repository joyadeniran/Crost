import { createSupabaseServerComponentClient, createServerSupabaseClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { TOP_TOOLS, SUPPORTED_TOOLKITS } from "@/lib/composio-tools";

export const dynamic = 'force-dynamic'

/**
 * GET /api/connect/sync
 * Synchronizes connection status with Crost database.
 * GCP migration: reads connection status from connections table (no Composio SDK).
 */
export async function GET(req: Request) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();

    // 1. Fetch active connections for this user from DB
    const { data: activeConnections } = await supabase
      .from('connections')
      .select('service_name')
      .eq('created_by', user.id)

    const connectedServices = new Set(
      (activeConnections ?? []).map((c: { service_name: string }) => c.service_name.toLowerCase())
    )

    // 2. Ensure Default Tools (System Tools) — ONLY seed if missing for the user
    const { data: existingAllTools } = await supabase
      .from('available_tools')
      .select('id')
      .eq('user_id', user.id);

    const existingIds = (existingAllTools ?? []).map((t: { id: string }) => t.id);

    const defaultTools = [
      { id: 'web_search', label: 'Web Search', description: 'Search the web for real-time research', is_configured: true, requires_config: false, risk_level: 'low', is_action: false },
      { id: 'file_reader', label: 'File Reader', description: 'Read uploaded documents and files', is_configured: true, requires_config: false, risk_level: 'low', is_action: false },
      { id: 'supabase_query', label: 'Database Query', description: 'Read-only queries against your account data', is_configured: false, requires_config: true, risk_level: 'medium', is_action: false }
    ];

    for (const dt of defaultTools) {
      if (!existingIds.includes(dt.id)) {
        await supabase.from('available_tools').insert({
          user_id: user.id,
          ...dt
        });
      }
    }

    // 3. PRE-SEED / SYNC: Ensure all SUPPORTED_TOOLKITS are present
    for (const slug of SUPPORTED_TOOLKITS) {
      const isConnected = connectedServices.has(slug.toLowerCase())

      // Toolkit row (UI primary)
      await supabase.from('available_tools').upsert({
        id: slug,
        user_id: user.id,
        label: slug.charAt(0).toUpperCase() + slug.slice(1),
        description: `Integration for ${slug} via Google APIs`,
        is_configured: isConnected,
        requires_config: true,
        risk_level: 'medium',
        is_action: false
      }, { onConflict: 'id, user_id' });

      // Individual "Lean" actions (Orc primary)
      if (TOP_TOOLS[slug]) {
        for (const tool of TOP_TOOLS[slug]) {
          await supabase.from('available_tools').upsert({
            id: tool.id,
            user_id: user.id,
            label: tool.label,
            description: tool.description,
            is_configured: isConnected,
            risk_level: 'medium',
            requires_config: true,
            is_action: true
          }, { onConflict: 'id, user_id' });
        }
      }
    }

    // 4. AGGRESSIVE CLEANUP: Remove any legacy tools or duplicates that don't belong in the modern registry
    const validToolkitSlugs = [...SUPPORTED_TOOLKITS, 'web_search', 'file_reader', 'supabase_query'];

    const { error: cleanupError } = await supabase
      .from('available_tools')
      .delete()
      .eq('user_id', user.id)
      .or(`id.eq.gmail_draft,and(id.not.in.(${validToolkitSlugs.join(',')}),is_action.eq.false)`);

    if (cleanupError) {
      console.warn('[Sync Cleanup] Non-fatal error during legacy tool cleanup:', cleanupError);
    }

    // 5. Fetch and return the updated tools list for the UI
    const { data: finalTools } = await supabase
      .from('available_tools')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_action', false)
      .eq('requires_config', true)
      .order('label');

    return NextResponse.json({
      success: true,
      tools: finalTools,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("[Sync Error]:", error);
    return NextResponse.json({
      error: error.message || "Synchronization failed"
    }, { status: 500 });
  }
}
