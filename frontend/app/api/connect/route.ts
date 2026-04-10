import { Composio } from "@composio/core";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { userId, provider } = await req.json(); // e.g., 'gmail'
    
    if (!process.env.COMPOSIO_API_KEY) {
      return NextResponse.json({ error: "COMPOSIO_API_KEY is not set" }, { status: 500 });
    }

    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
    const session = await composio.create(userId);
    
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
