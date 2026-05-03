import type { ReactNode } from 'react'

export type ViewState =
  | { type: string; [key: string]: unknown }
  | string

export type PluginSettingsProps = {
  onDone?: (message?: string) => void
  onComplete?: (message?: string) => void
  args?: string
  cliMode?: boolean
  children?: ReactNode
}
