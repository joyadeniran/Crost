// lib/model-routing.ts — Model selection by task type and user config

import { createServerSupabaseClient } from './supabase'
import type { ModelRole } from '@/types'

// Fallback models if no user assignment exists
// These must match LiteLLM config.yaml model_list entries
const FALLBACK_MODELS: Record<ModelRole, string> = {
  'reasoning': 'claude-opus-4.6',
  'execution': 'groq/llama-3.3-70b-versatile',
  'utility': 'gemini-1.5-flash'
}

// Task type → role mapping
const TASK_TYPE_TO_ROLE: Record<string, ModelRole> = {
  'orc_planning': 'reasoning',
  'research': 'execution',
  'analysis': 'reasoning',
  'memo_writing': 'utility',
  'synthesis': 'reasoning',
  'tool_execution': 'execution',
  'data_processing': 'execution'
}

export async function getModelForTask(
  userId: string,
  taskType: string
): Promise<{ model: string; provider: string }> {
  const role = TASK_TYPE_TO_ROLE[taskType] || 'execution'

  try {
    const supabase = createServerSupabaseClient()
    const { data } = await supabase
      .from('user_model_assignments')
      .select('model_name, provider')
      .eq('created_by', userId)
      .eq('role', role)
      .single()

    if (data) {
      return {
        model: data.model_name,
        provider: data.provider
      }
    }
  } catch (err) {
    console.warn(`[model-routing] No assignment for role ${role}, using fallback`)
  }

  const fallback = FALLBACK_MODELS[role]
  return {
    model: fallback,
    provider: fallback.split('-')[0]
  }
}

export async function getUserModelConfig(userId: string) {
  try {
    const supabase = createServerSupabaseClient()
    const { data } = await supabase
      .from('user_model_assignments')
      .select('*')
      .eq('created_by', userId)

    return data || []
  } catch (err) {
    console.warn('[model-routing] Failed to fetch user config:', err)
    return []
  }
}
