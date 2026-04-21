'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
            : state.selectedDepartments.length >= 3
              ? state.selectedDepartments
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
    }
  )
)
