'use client'

import { useCrostStore } from '@/lib/store'
import { DepartmentGrid } from './DepartmentGrid'

/**
 * Reads departments from Zustand (kept live by RealtimeProvider) and renders the grid.
 */
export function LiveDepartmentGrid() {
  const departments = useCrostStore((s) => s.departments)
  return <DepartmentGrid departments={departments} />
}
