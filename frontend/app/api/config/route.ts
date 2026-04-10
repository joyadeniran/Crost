// PATCH /api/config — update a founder-editable system_config value
// Body: { key: string, value: unknown }
// Only keys where is_founder_editable = true can be updated.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { z } from 'zod'

const UpdateConfigSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
})

export async function PATCH(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const body = await req.json()
    const { key, value } = UpdateConfigSchema.parse(body)
    const supabase = createServerSupabaseClient()

    // 1. Verify if the key is allowed to be edited or if it's a new identity key
    // We allow upserting these specific keys for identity
    const allowedKeys = ['founder_name', 'company_name', 'local_identity', 'risk_tolerance', 'token_hard_limit_per_session'];
    
    if (!allowedKeys.includes(key)) {
      // Check if it's a protected key in global config
      const { data: existing } = await supabase
        .from('system_config')
        .select('is_founder_editable')
        .eq('key', key)
        .eq('created_by', user.id)
        .single();
        
      if (existing && !existing.is_founder_editable) {
        return NextResponse.json({ error: `Key "${key}" is protected.` }, { status: 403 });
      }
    }

    // 2. Upsert (Create or Update) the config for this specific user
    const { data, error } = await supabase
      .from('system_config')
      .upsert({ 
        key, 
        value: typeof value === 'string' ? value : JSON.stringify(value), 
        created_by: user.id,
        is_founder_editable: true,
        updated_at: new Date().toISOString() 
      }, { onConflict: 'key, created_by' })
      .select()
      .single()

    if (error) {
      console.error('[PATCH /api/config] DB Error:', error);
      return NextResponse.json({ error: error.message, details: error }, { status: 500 })
    }
    return NextResponse.json({ data })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[PATCH /api/config] Unexpected Error:', err)
    return NextResponse.json({ 
      error: 'Failed to update config', 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, { status: 500 })
  }
}
