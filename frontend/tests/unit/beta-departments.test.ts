import { describe, it, expect } from 'vitest'
import { BETA_DEPARTMENT_SLUGS, normalizeSelectedDepartments } from '@/lib/beta-departments'

describe('normalizeSelectedDepartments', () => {
  it('defaults to all four beta departments when nothing valid is selected', () => {
    for (const bad of [undefined, null, [], 'sales', 42, {}, ['finance'], [1, 2]]) {
      expect(normalizeSelectedDepartments(bad)).toEqual([...BETA_DEPARTMENT_SLUGS])
    }
  })

  it('keeps a valid subset, de-duplicated, in the given order', () => {
    expect(normalizeSelectedDepartments(['sales', 'marketing', 'sales'])).toEqual(['sales', 'marketing'])
  })

  it('drops unknown slugs (cannot clone arbitrary templates)', () => {
    expect(normalizeSelectedDepartments(['orchestrator', 'sales', '../x'])).toEqual(['sales'])
  })

  it('is exactly marketing/engineering/sales/operations', () => {
    expect([...BETA_DEPARTMENT_SLUGS]).toEqual(['marketing', 'engineering', 'sales', 'operations'])
  })
})
