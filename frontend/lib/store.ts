// lib/store.ts
// Zustand global state store for Crost dashboard

import { create } from 'zustand'
import type { Department, Goal } from '@/types'

interface CrostStore {
  // State
  departments: Department[]
  envMode: 'local' | 'cloud'
  pendingApprovalCount: number
  artifactCount: number
  isLoading: boolean
  showEventsPanel: boolean

  // Active goal (War Room)
  activeGoal: Goal | null
  isSubmittingGoal: boolean

  // Actions
  setDepartments: (departments: Department[]) => void
  setEnvMode: (mode: 'local' | 'cloud') => void
  setPendingApprovalCount: (count: number) => void
  setArtifactCount: (count: number) => void
  setIsLoading: (loading: boolean) => void
  setShowEventsPanel: (show: boolean) => void


  // Goal actions
  setActiveGoal: (goal: Goal | null) => void
  updateActiveGoal: (updates: Partial<Goal>) => void
  setIsSubmittingGoal: (loading: boolean) => void

  // Realtime department actions
  upsertDepartment: (department: Department) => void
  removeDepartment: (id: string) => void
  updateDepartmentStatus: (id: string, status: Department['status'], currentTask?: string | null) => void
}

import { persist } from 'zustand/middleware'

export const useCrostStore = create<CrostStore>()(
  persist(
    (set) => ({
      // Initial state
      departments: [],
      envMode: 'cloud',
      pendingApprovalCount: 0,
      artifactCount: 0,
      isLoading: true,
      showEventsPanel: true,
      activeGoal: null,
      isSubmittingGoal: false,

      // Setters
      setDepartments: (departments) => set({ departments }),
      setEnvMode: (envMode) => set({ envMode }),
      setPendingApprovalCount: (pendingApprovalCount) => set({ pendingApprovalCount }),
      setArtifactCount: (artifactCount) => set({ artifactCount }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setShowEventsPanel: (showEventsPanel) => set({ showEventsPanel }),


      // Goal setters
      setActiveGoal: (activeGoal) => set({ activeGoal }),
      updateActiveGoal: (updates) =>
        set((state) => ({
          activeGoal: state.activeGoal ? { ...state.activeGoal, ...updates } : null,
        })),
      setIsSubmittingGoal: (isSubmittingGoal) => set({ isSubmittingGoal }),

      // Upsert department (Realtime INSERT/UPDATE)
      upsertDepartment: (department) =>
        set((state) => {
          const existing = state.departments.findIndex((d) => d.id === department.id)
          if (existing >= 0) {
            const updated = [...state.departments]
            updated[existing] = department
            return { departments: updated }
          }
          return { departments: [...state.departments, department] }
        }),

      // Remove department (Realtime DELETE)
      removeDepartment: (id) =>
        set((state) => ({
          departments: state.departments.filter((d) => d.id !== id),
        })),

      // Update department status + current_task (live task updates)
      updateDepartmentStatus: (id, status, currentTask = null) =>
        set((state) => ({
          departments: state.departments.map((d) =>
            d.id === id ? { ...d, status, current_task: currentTask } : d
          ),
        })),
    }),
    {
      name: 'crost-store',
      partialize: (state) => ({ activeGoal: state.activeGoal, showEventsPanel: state.showEventsPanel }),
    }
  )
)
