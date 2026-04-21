import { Composio } from "@composio/core";
import { createSupabaseServerComponentClient, createServerSupabaseClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { TOP_TOOLS, SUPPORTED_TOOLKITS } from "@/lib/composio-tools";

export const dynamic = 'force-dynamic'

/**
 * GET /api/connect/sync
 * Synchronizes Composio connection status with Crost database.
 * Implements the "Lean" Tool Policy: Only show the Top 5 tools per service.
 * Implements Multi-Tenancy: Scopes all available_tools to the specific user.
 */
export async function GET(req: Request) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    if (!process.env.COMPOSIO_API_KEY) {
      return NextResponse.json({ error: "COMPOSIO_API_KEY is not set" }, { status: 500 });
    }

    const supabase = createServerSupabaseClient();
    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
    
    // 1. Create session for the specific user
    const session = await composio.create(user.id);
    
    // 2. Fetch toolkits from Composio (includes connection status)
    const toolkitsResult = await session.toolkits();
    const toolkits = (toolkitsResult as any).items || [];
    
    // 3. Ensure Default Tools (System Tools) - ONLY seed if missing for the user
    const { data: existingAllTools } = await supabase
      .from('available_tools')
      .select('id')
      .eq('user_id', user.id);

    const existingIds = (existingAllTools ?? []).map(t => t.id);
    
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

    // 4. PRE-SEED / SYNC: Ensure all SUPPORTED_TOOLKITS are present
    for (const slug of SUPPORTED_TOOLKITS) {
      // Find if Composio already has a connection status for this
      // Case-insensitive match since Composio names are capitalized (Gmail, GitHub, etc.)
      const toolkit = toolkits.find((t: any) => t.name.toLowerCase() === slug.toLowerCase());
      const isConnected = toolkit?.connection?.isActive ?? false;

      // Toolkit row (UI primary)
      await supabase.from('available_tools').upsert({
        id: slug,
        user_id: user.id,
        label: toolkit?.label || slug.charAt(0).toUpperCase() + slug.slice(1),
        description: toolkit?.description || `Integration for ${slug} via Composio`,
        is_configured: isConnected,
        requires_config: true,
        risk_level: 'medium',
        is_action: false
      }, { onConflict: 'id, user_id' });

      // individual "Lean" actions (Orc primary)
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

      // Sync connections table (Upsert)
      if (isConnected && toolkit?.connection) {
        await supabase
          .from('connections')
          .upsert({
            user_id: user.id,
            tool_slug: slug,
            composio_connection_id: toolkit.connection.connectedAccount?.id || 'managed',
            status: 'connected',
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id, tool_slug' });
      } else if (!isConnected) {
        // Optional: Mark as revoked/expired if previously connected but now not
        await supabase
          .from('connections')
          .delete()
          .eq('user_id', user.id)
          .eq('tool_slug', slug);
      }
    }

    // 5. AGGRESSIVE CLEANUP: Remove any legacy tools or duplicates that don't belong in the modern registry
    const validToolkitSlugs = [...SUPPORTED_TOOLKITS, 'web_search', 'file_reader', 'supabase_query'];
    
    // We want to delete tools that:
    // a) are not in the valid toolkit slugs AND are not specific actions (is_action=false)
    // b) have the legacy 'gmail_draft' ID
    const { error: cleanupError } = await supabase
      .from('available_tools')
      .delete()
      .eq('user_id', user.id)
      .or(`id.eq.gmail_draft,and(id.not.in.(${validToolkitSlugs.join(',')}),is_action.eq.false)`);

    if (cleanupError) {
      console.warn('[Sync Cleanup] Non-fatal error during legacy tool cleanup:', cleanupError);
    }

    // 6. Fetch and return the updated tools list for the UI
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
    console.error("[Composio Sync Error]:", error);
    return NextResponse.json({ 
      error: error.message || "Synchronization failed"
    }, { status: 500 });
  }
}
