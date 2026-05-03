import type { ReactNode } from 'react'

export type WizardStepComponent = () => ReactNode

export type WizardProviderProps<T = Record<string, unknown>> = {
  steps: WizardStepComponent[]
  initialData: T
  onComplete: (data: T) => void
  onCancel?: () => void
  title?: string
  showStepCounter?: boolean
  children?: ReactNode
}

export type WizardContextValue<T = Record<string, unknown>> = {
  currentStepIndex: number
  totalSteps: number
  wizardData: T
  setWizardData: (data: T | ((previous: T) => T)) => void
  updateWizardData: (patch: Partial<T>) => void
  goNext: () => void
  goBack: () => void
  goToStep: (index: number) => void
  cancel: () => void
  title?: string
  showStepCounter?: boolean
}
