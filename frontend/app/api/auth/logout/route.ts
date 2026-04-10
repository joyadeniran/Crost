import { createSupabaseServerComponentClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createSupabaseServerComponentClient()
  
  // Sign out from Supabase (clears cookies via the server component client)
  await supabase.auth.signOut()

  return NextResponse.json({ success: true })
}
