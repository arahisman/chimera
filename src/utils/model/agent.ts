import type { PermissionMode } from '../permissions/PermissionMode.js'
import { capitalize } from '../stringUtils.js'
import {
  getCodexModelConfig,
  listCodexModels,
  normalizeCodexModelId,
} from '../../services/codex/models/registry.js'
import { parseProviderModel } from '../../services/providers/catalog.js'

export const AGENT_MODEL_OPTIONS = [
  'inherit',
  ...listCodexModels().map(model => model.id),
] as const
export type AgentModelAlias = (typeof AGENT_MODEL_OPTIONS)[number]

export type AgentModelOption = {
  value: string
  label: string
  description: string
}

/**
 * Get the default subagent model. Returns 'inherit' so subagents inherit
 * the model from the parent thread.
 */
export function getDefaultSubagentModel(): string {
  return 'inherit'
}

export function getAgentModel(
  agentModel: string | undefined,
  parentModel: string,
  toolSpecifiedModel?: string,
  _permissionMode?: PermissionMode,
): string {
  const selectedModel =
    process.env.CHIMERA_SUBAGENT_MODEL ??
    toolSpecifiedModel ??
    agentModel ??
    getDefaultSubagentModel()
  return resolveCodexAgentModel(selectedModel, parentModel)
}

function resolveCodexAgentModel(model: string, parentModel: string): string {
  if (model === 'inherit') return parentModel

  const externalModel = parseProviderModel(model)
  if (externalModel) {
    return `${externalModel.providerId}/${externalModel.modelId}`
  }

  const normalized = normalizeCodexModelId(model)
  if (!getCodexModelConfig(normalized)) {
    throw new Error(
      `Model '${model}' is not supported by Chimera. Choose an OpenAI model such as gpt-5.5, gpt-5.4, or gpt-5.4-mini, or an external provider model such as openrouter/openai/gpt-5.4.`,
    )
  }
  return normalized
}

export function getAgentModelDisplay(model: string | undefined): string {
  // When model is omitted, getDefaultSubagentModel() returns 'inherit' at runtime
  if (!model) return 'Inherit from parent (default)'
  if (model === 'inherit') return 'Inherit from parent'
  const config = getCodexModelConfig(model)
  if (config) return config.label
  return capitalize(model)
}

/**
 * Get available model options for agents
 */
export function getAgentModelOptions(): AgentModelOption[] {
  return [
    {
      value: 'inherit',
      label: 'Inherit from parent',
      description: 'Use the same model as the main conversation',
    },
    ...listCodexModels().map(model => ({
      value: model.id,
      label: model.label,
      description:
        model.id === 'gpt-5.5'
          ? 'Most capable for complex agent tasks'
          : model.id === 'gpt-5.4-mini'
            ? 'Fast and efficient for focused agent tasks'
            : 'OpenAI model for agent tasks',
    })),
  ]
}
