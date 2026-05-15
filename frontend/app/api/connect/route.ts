import { Composio } from "@composio/core";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerComponentClient } from "@/lib/supabase";

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const { provider } = await req.json(); // e.g., 'gmail'

    if (!process.env.COMPOSIO_API_KEY) {
      return NextResponse.json({ error: "COMPOSIO_API_KEY is not set" }, { status: 500 });
    }

    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
    const session = await composio.create(user.id);
    
    // Pass callback_url so Composio redirects back to Crost once connection is successful
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL as string;
    const callbackUrl = `${baseUrl}/dashboard/settings`;
    
    const connection = await session.authorize(provider, {
      callbackUrl: callbackUrl
    });
    
    return NextResponse.json({ url: connection.redirectUrl });
  } catch (error: any) {
    console.error("[Composio Connect Error]:", error);
    return NextResponse.json({ error: error.message || "Failed to create connection" }, { status: 500 });
  }
}
