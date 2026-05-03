import type { AgentDefinition } from '../../../tools/AgentTool/loadAgentsDir.js'

export type AgentWizardData = {
  location?: string
  method?: 'manual' | 'generate'
  generationPrompt?: string
  wasGenerated?: boolean
  agentType?: string
  systemPrompt?: string
  whenToUse?: string
  selectedTools?: string[]
  selectedModel?: string
  finalAgent?: AgentDefinition
}
