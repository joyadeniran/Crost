'use client'

import { create } from 'zustand'
import { persist, StorageValue } from 'zustand/middleware'
import { getSupabaseClient } from './supabase-browser'

export interface OnboardingState {
  // Screen 1: Identity
  founderName: string
  companyName: string
  city: string
  country: string
  businessDescription: string
  businessCategory: string
  stage: 'starting' | 'mvp' | 'traction' | 'scaling' | null

  // Screen 2: Control style
  riskTolerance: 'careful' | 'balanced' | 'aggressive'

  // Screen 3: Pick your team
  selectedDepartments: string[] // slugs

  // Activation moment
  firstGoal: string
  orcPlan: any | null // Use any for now or specific type if shared

  // Actions
  setIdentity: (data: Partial<OnboardingState>) => void
  setRiskTolerance: (value: 'careful' | 'balanced' | 'aggressive') => void
  toggleDepartment: (slug: string) => void
  setFirstGoal: (goal: string) => void
  setOrcPlan: (plan: any) => void
  reset: () => void
}

// Custom storage that scopes localStorage to current user
const createUserScopedStorage = () => {
  return {
    getItem: (name: string): StorageValue | null => {
      try {
        // Try to get user ID from Supabase
        const supabase = getSupabaseClient()
        supabase.auth.getSession().then(({ data: { session } }) => {
          const userId = session?.user?.id
          const key = userId ? `${name}-${userId}` : name
          const item = localStorage.getItem(key)
          return item ? JSON.parse(item) : null
        })
      } catch {
        // Fallback to unscoped key if auth not ready
        const item = localStorage.getItem(name)
        return item ? JSON.parse(item) : null
      }
      return null
    },
    setItem: (name: string, value: StorageValue) => {
      try {
        const supabase = getSupabaseClient()
        supabase.auth.getSession().then(({ data: { session } }) => {
          const userId = session?.user?.id
          const key = userId ? `${name}-${userId}` : name
          localStorage.setItem(key, JSON.stringify(value))
        })
      } catch {
        // Fallback to unscoped key if auth not ready
        localStorage.setItem(name, JSON.stringify(value))
      }
    },
    removeItem: (name: string) => {
      try {
        const supabase = getSupabaseClient()
        supabase.auth.getSession().then(({ data: { session } }) => {
          const userId = session?.user?.id
          const key = userId ? `${name}-${userId}` : name
          localStorage.removeItem(key)
        })
      } catch {
        localStorage.removeItem(name)
      }
    },
  }
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      // Initial state
      founderName: '',
      companyName: '',
      city: '',
      country: '',
      businessDescription: '',
      businessCategory: '',
      stage: null,
      riskTolerance: 'balanced',
      selectedDepartments: [],
      firstGoal: '',
      orcPlan: null,

      // Actions
      setIdentity: (data) => set((state) => ({ ...state, ...data })),
      setRiskTolerance: (riskTolerance) => set({ riskTolerance }),
      toggleDepartment: (slug) =>
        set((state) => ({
          selectedDepartments: state.selectedDepartments.includes(slug)
            ? state.selectedDepartments.filter((s) => s !== slug)
            : [...state.selectedDepartments, slug],
        })),
      setFirstGoal: (firstGoal) => set({ firstGoal }),
      setOrcPlan: (orcPlan) => set({ orcPlan }),
      reset: () =>
        set({
          founderName: '',
          companyName: '',
          city: '',
          country: '',
          businessDescription: '',
          businessCategory: '',
          stage: null,
          riskTolerance: 'balanced',
          selectedDepartments: [],
          firstGoal: '',
          orcPlan: null,
        }),
    }),
    {
      name: 'crost-onboarding-storage',
      storage: createUserScopedStorage(),
    }
  )
)
