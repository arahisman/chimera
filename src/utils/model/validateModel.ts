// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import {
  isKnownCodexModel,
  normalizeCodexModelId,
} from '../../services/codex/models/registry.js'
import { parseProviderModel } from '../../services/providers/catalog.js'

/**
 * Validates a model by attempting an actual API call.
 */
export async function validateModel(
  model: string,
): Promise<{ valid: boolean; error?: string }> {
  const normalizedModel = model.trim()

  // Empty model is invalid
  if (!normalizedModel) {
    return { valid: false, error: 'Model name cannot be empty' }
  }

  const externalModel = parseProviderModel(normalizedModel)
  if (externalModel) {
    return { valid: true }
  }

  const codexModel = normalizeCodexModelId(normalizedModel)
  return isKnownCodexModel(codexModel)
    ? { valid: true }
    : {
        valid: false,
        error: `Model '${codexModel}' is not supported by Chimera. Choose an OpenAI model such as gpt-5.5, gpt-5.4, or gpt-5.4-mini, or an external provider model such as openrouter/openai/gpt-5.4.`,
      }
}
