import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()

    // Check Supabase connectivity
    const { data, error } = await supabase
      .from('system_config')
      .select('key')
      .limit(1)

    if (error) {
      return NextResponse.json(
        {
          status: 'unhealthy',
          error: 'Supabase connection failed',
          details: error.message
        },
        { status: 503 }
      )
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        supabase: 'ok'
      }
    })
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: err.message
      },
      { status: 503 }
    )
  }
}
