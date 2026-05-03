import { isEnvTruthy } from '../../../utils/envUtils.js'

export type CodexModelAvailability = 'stable' | 'preview' | 'live-discovered'

export type CodexReasoningEffort =
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'

export type CodexModelConfig = {
  id: string
  label: string
  availability: CodexModelAvailability
  defaultEffort: 'low' | 'medium' | 'high' | 'xhigh'
  allowedEfforts: readonly CodexReasoningEffort[]
  contextWindow: number
  maxOutputTokens: number
  supportsImages: boolean
  supportsTools: boolean
  supportsComputerUse: boolean
  supportsWebSearch: boolean
  supportsFileSearch: boolean
}

export type CodexModelRegistryOptions = {
  includeExperimental?: boolean
  liveDiscoveredModelIds?: readonly string[]
}

export const CODEX_DEFAULT_MODEL_ID = 'gpt-5.5'

const PREVIEW_MODEL_IDS = new Set<string>(['gpt-5.3-codex-spark'])

const FULL_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const
const LIGHT_REASONING_EFFORTS = ['low', 'medium', 'high'] as const

const STATIC_CODEX_MODELS = [
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    availability: 'stable',
    defaultEffort: 'high',
    allowedEfforts: FULL_REASONING_EFFORTS,
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    supportsImages: true,
    supportsTools: true,
    supportsComputerUse: true,
    supportsWebSearch: true,
    supportsFileSearch: true,
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    availability: 'stable',
    defaultEffort: 'medium',
    allowedEfforts: FULL_REASONING_EFFORTS,
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    supportsImages: true,
    supportsTools: true,
    supportsComputerUse: true,
    supportsWebSearch: true,
    supportsFileSearch: true,
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    availability: 'stable',
    defaultEffort: 'medium',
    allowedEfforts: LIGHT_REASONING_EFFORTS,
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    supportsImages: true,
    supportsTools: true,
    supportsComputerUse: false,
    supportsWebSearch: true,
    supportsFileSearch: true,
  },
  {
    id: 'gpt-5.4-nano',
    label: 'GPT-5.4 Nano',
    availability: 'stable',
    defaultEffort: 'low',
    allowedEfforts: ['low', 'medium'],
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    supportsImages: true,
    supportsTools: true,
    supportsComputerUse: false,
    supportsWebSearch: true,
    supportsFileSearch: true,
  },
  {
    id: 'gpt-5.3-codex',
    label: 'GPT-5.3 Codex',
    availability: 'stable',
    defaultEffort: 'high',
    allowedEfforts: FULL_REASONING_EFFORTS,
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    supportsImages: true,
    supportsTools: true,
    supportsComputerUse: true,
    supportsWebSearch: true,
    supportsFileSearch: true,
  },
  {
    id: 'gpt-5.3-codex-spark',
    label: 'GPT-5.3 Codex Spark',
    availability: 'preview',
    defaultEffort: 'high',
    allowedEfforts: FULL_REASONING_EFFORTS,
    contextWindow: 128_000,
    maxOutputTokens: 32_000,
    supportsImages: false,
    supportsTools: true,
    supportsComputerUse: false,
    supportsWebSearch: true,
    supportsFileSearch: true,
  },
] as const satisfies readonly CodexModelConfig[]

export function listCodexModels(
  options: CodexModelRegistryOptions = {},
): readonly CodexModelConfig[] {
  const includeExperimental =
    options.includeExperimental ??
    isEnvTruthy(
      process.env.CHIMERA_EXPERIMENTAL_MODEL_ALLOWLIST ??
        process.env.CODEX_CODE_EXPERIMENTAL_MODEL_ALLOWLIST,
    )
  const liveDiscoveredModelIds = new Set(
    options.liveDiscoveredModelIds?.map(normalizeCodexModelId) ?? [],
  )

  return STATIC_CODEX_MODELS.filter(model => {
    if (!PREVIEW_MODEL_IDS.has(model.id)) return true
    return includeExperimental || liveDiscoveredModelIds.has(model.id)
  })
}

export function getDefaultCodexModel(): CodexModelConfig {
  const model = getCodexModelConfig(CODEX_DEFAULT_MODEL_ID)
  if (!model) {
    throw new Error(`Default Codex model "${CODEX_DEFAULT_MODEL_ID}" is not registered`)
  }
  return model
}

export function getCodexModelConfig(
  model: string,
  options: CodexModelRegistryOptions = {},
): CodexModelConfig | undefined {
  const normalized = normalizeCodexModelId(model)
  return listCodexModels(options).find(config => config.id === normalized)
}

export function isKnownCodexModel(
  model: string,
  options: CodexModelRegistryOptions = {},
): boolean {
  return getCodexModelConfig(model, options) !== undefined
}

export function getCodexModelContextWindow(
  model: string,
  options: CodexModelRegistryOptions = {},
): number | undefined {
  return getCodexModelConfig(model, options)?.contextWindow
}

export function getCodexModelMaxOutputTokens(
  model: string,
  options: CodexModelRegistryOptions = {},
): number | undefined {
  return getCodexModelConfig(model, options)?.maxOutputTokens
}

export function normalizeCodexModelId(model: string): string {
  return model.trim().toLowerCase()
}
