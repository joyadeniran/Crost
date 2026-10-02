// lib/beta-departments.ts
// The four fixed departments every founder gets in the beta (cloned from the
// global templates seeded by the baseline migration). Shared by the onboarding
// store (client) and the onboarding routes (server) — keep this file free of
// server-only imports.

export const BETA_DEPARTMENT_SLUGS = ['marketing', 'engineering', 'sales', 'operations'] as const

export type BetaDepartmentSlug = (typeof BETA_DEPARTMENT_SLUGS)[number]

/** Validates a requested selection; an empty/invalid selection means "all four". */
export function normalizeSelectedDepartments(input: unknown): BetaDepartmentSlug[] {
  const allowed = new Set<string>(BETA_DEPARTMENT_SLUGS)
  const picked = Array.isArray(input)
    ? Array.from(new Set(input.filter((s): s is string => typeof s === 'string' && allowed.has(s))))
    : []
  return (picked.length > 0 ? picked : [...BETA_DEPARTMENT_SLUGS]) as BetaDepartmentSlug[]
}
