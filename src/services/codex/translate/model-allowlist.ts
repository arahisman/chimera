import { isEnvTruthy } from '../../../utils/envUtils.js'
import {
  isKnownCodexModel,
  listCodexModels,
  normalizeCodexModelId,
} from '../models/registry.js'

export const CODEX_ALLOWED_MODELS = new Set(
  listCodexModels({ includeExperimental: false }).map(model => model.id),
)

const SUGGESTED_MODELS = 'gpt-5.5, gpt-5.4, or gpt-5.4-mini'

export class CodexModelNotAllowedError extends Error {
  constructor(public readonly model: string) {
    super(
      `Model "${model}" is not supported by Chimera. Choose an OpenAI model such as ${SUGGESTED_MODELS}.`,
    )
    this.name = 'CodexModelNotAllowedError'
  }
}

export function resolveCodexModel(model: string): string {
  const override = (
    process.env.CHIMERA_MODEL ?? process.env.CODEX_CODE_MODEL
  )?.trim()
  const selected = override || model
  return normalizeCodexModelId(selected)
}

export function assertCodexModelAllowed(model: string): void {
  const normalized = normalizeCodexModelId(model)
  if (isKnownCodexModel(normalized)) return

  const allowExperimental = isEnvTruthy(
    process.env.CHIMERA_EXPERIMENTAL_MODEL_ALLOWLIST ??
      process.env.CODEX_CODE_EXPERIMENTAL_MODEL_ALLOWLIST,
  )
  if (
    allowExperimental &&
    (isKnownCodexModel(normalized, { includeExperimental: true }) ||
      isFutureGptModel(normalized))
  ) {
    return
  }
  throw new CodexModelNotAllowedError(normalized)
}

function isFutureGptModel(model: string): boolean {
  const match = /^gpt-(\d+)\.(\d+)(?:[.-].*)?$/.exec(model)
  if (!match) return false
  const major = Number(match[1])
  const minor = Number(match[2])
  return major > 5 || (major === 5 && minor > 5)
}
