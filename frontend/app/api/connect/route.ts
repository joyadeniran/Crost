import { Composio } from "@composio/core";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createSupabaseServerComponentClient } from "@/lib/supabase";
import { beginIdempotentRequest, completeIdempotentRequest } from "@/lib/idempotency";

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const body = await req.json();
    const { provider } = body; // e.g., 'gmail'
    if (!provider || typeof provider !== 'string') {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 });
    }
    const supabase = createServerSupabaseClient();

    const idempotency = await beginIdempotentRequest(req, supabase, user.id, body);
    if (idempotency.kind === 'response') return idempotency.response;

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
    
    const responseBody = { url: connection.redirectUrl };
    await completeIdempotentRequest(req, supabase, user.id, responseBody, 200);

    return NextResponse.json(responseBody);
  } catch (error: any) {
    console.error("[Composio Connect Error]:", error);
    return NextResponse.json({ error: error.message || "Failed to create connection" }, { status: 500 });
  }
}
