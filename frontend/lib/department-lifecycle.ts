// lib/department-lifecycle.ts
// Department CRUD logic, Zod validation schema, and lifecycle helpers.

import { z } from 'zod'
import type { ApiResponse, Department } from '@/types'

// Slugs reserved by Crost system routes — cannot be used for departments
export const RESERVED_SLUGS = [
  'system', 'admin', 'api', 'memos', 'approvals',
  'settings', 'onboarding', 'health', 'toggle', 'status',
]

// Fetches available tool IDs from the API (used by Zod async refine)
async function getAvailableToolIds(): Promise<string[]> {
  try {
    const res = await fetch('/api/tools')
    if (!res.ok) return []
    const json = await res.json() as ApiResponse<{ id: string }[]>
    return json.data?.map((t) => t.id) ?? []
  } catch {
    return []
  }
}

// Full Zod schema for creating a department
export const CreateDepartmentSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be under 50 characters')
    .regex(/^[a-zA-Z0-9 _-]+$/, 'Name can only contain letters, numbers, spaces, hyphens, and underscores'),

  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50, 'Slug must be under 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only')
    .refine(
      (slug) => !RESERVED_SLUGS.includes(slug),
      (slug) => ({ message: `"${slug}" is reserved by Crost and cannot be used` })
    ),

  persona_prompt: z
    .string()
    .min(50, 'Persona prompt must be at least 50 characters — be specific about this department\'s role'),

  model_provider: z.enum(['local', 'gemini', 'claude', 'groq']),

  model_name: z.string().min(1, 'Model name is required'),

  tools: z
    .array(z.string())
    .default([])
    .refine(
      async (tools) => {
        if (tools.length === 0) return true
        const available = await getAvailableToolIds()
        return tools.every((t) => available.includes(t))
      },
      { message: 'One or more tools are not available or not configured' }
    ),

  capabilities: z.array(z.string()).default([]),

  restrictions: z.array(z.string()).default([]),

  tone_override: z.string().optional(),

  icon: z.string().default('briefcase'),

  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color (e.g. #6366f1)')
    .default('#6366f1'),
})

export type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>

// Zod schema for updating a department (all fields optional)
export const UpdateDepartmentSchema = CreateDepartmentSchema.partial().omit({ slug: true })
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>

// --- API CALLS ---

export async function createDepartment(
  input: CreateDepartmentInput
): Promise<ApiResponse<Department>> {
  const res = await fetch('/api/departments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return res.json()
}

export async function getDepartments(): Promise<ApiResponse<Department[]>> {
  const res = await fetch('/api/departments')
  return res.json()
}

export async function getDepartment(slug: string): Promise<ApiResponse<Department>> {
  const res = await fetch(`/api/departments/${slug}`)
  return res.json()
}

export async function updateDepartment(
  slug: string,
  input: UpdateDepartmentInput
): Promise<ApiResponse<Department>> {
  const res = await fetch(`/api/departments/${slug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return res.json()
}

export async function activateDepartment(
  slug: string
): Promise<ApiResponse<Department>> {
  const res = await fetch(`/api/departments/${slug}/activate`, {
    method: 'POST',
  })
  return res.json()
}

export async function deprecateDepartment(slug: string): Promise<ApiResponse<{ deprecated: boolean }>> {
  const res = await fetch(`/api/departments/${slug}`, {
    method: 'DELETE',
  })
  return res.json()
}

export async function hardDeleteDepartment(slug: string): Promise<ApiResponse<{ deleted: boolean }>> {
  const res = await fetch(`/api/departments/${slug}?hard=true`, {
    method: 'DELETE',
  })
  return res.json()
}
