// PATCH /api/config — update a founder-editable system_config value
// Body: { key: string, value: unknown }
// Only keys where is_founder_editable = true can be updated.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { z } from 'zod'

const UpdateConfigSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
})

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { key, value } = UpdateConfigSchema.parse(body)
    const supabase = createServerSupabaseClient()

    // Verify the key exists and is founder-editable
    const { data: existing, error: fetchErr } = await supabase
      .from('system_config')
      .select('is_founder_editable')
      .eq('key', key)
      .single()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: `Config key "${key}" not found.` }, { status: 404 })
    }
    if (!existing.is_founder_editable) {
      return NextResponse.json(
        { error: `Config key "${key}" is protected and cannot be modified.`, code: 'PROTECTED_KEY' },
        { status: 403 }
      )
    }

    const { data, error } = await supabase
      .from('system_config')
      .update({ value: JSON.stringify(value), updated_at: new Date().toISOString() })
      .eq('key', key)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[PATCH /api/config]', err)
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
  }
}
