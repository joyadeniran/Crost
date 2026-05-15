import { NextResponse } from 'next/server'
import type { ApiResponse } from '@/types'

export function apiOk<T>(data: T, meta?: Record<string, unknown>): NextResponse<ApiResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
    ...(meta ? { _metadata: meta } : {}),
  })
}

export function apiError(
  message: string,
  status: number,
  code?: string
): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    { success: false, error: message, ...(code ? { code } : {}), timestamp: new Date().toISOString() },
    { status }
  )
}
