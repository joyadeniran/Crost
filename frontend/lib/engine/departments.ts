// lib/engine/departments.ts
// Shared department-resolution helpers used across the engine modules
// (orchestrator, worker, events). Extracted verbatim from lib/llm-client.ts
// during the Phase 2 god-module split — no behavior change.

import { createServerSupabaseClient } from '@/lib/supabase'
import type { Department } from '@/types'

export async function resolveDepartmentBySlug(
  slug: string,
  userId?: string | null
): Promise<Department | null> {
  const supabase = createServerSupabaseClient()

  if (userId) {
    const { data: userDepartment } = await supabase
      .from('departments')
      .select('*')
      .eq('slug', slug)
      .eq('created_by', userId)
      .maybeSingle()

    if (userDepartment) return userDepartment as Department
  }

  const { data: globalDepartment } = await supabase
    .from('departments')
    .select('*')
    .eq('slug', slug)
    .is('created_by', null)
    .maybeSingle()

  return (globalDepartment as Department | null) ?? null
}

export async function resolveOrchestratorDepartment(userId?: string | null): Promise<Department | null> {
  const supabase = createServerSupabaseClient()

  if (userId) {
    const { data: userOrchestrator } = await supabase
      .from('departments')
      .select('*')
      .eq('is_orchestrator', true)
      .eq('created_by', userId)
      .maybeSingle()

    if (userOrchestrator) return userOrchestrator as Department
  }

  const { data: globalOrchestrator } = await supabase
    .from('departments')
    .select('*')
    .eq('is_orchestrator', true)
    .is('created_by', null)
    .maybeSingle()

  return (globalOrchestrator as Department | null) ?? null
}
