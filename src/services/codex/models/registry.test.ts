import { afterEach, describe, expect, test } from 'bun:test'
import {
  getCodexModelContextWindow,
  getCodexModelConfig,
  getCodexModelMaxOutputTokens,
  getDefaultCodexModel,
  isKnownCodexModel,
  listCodexModels,
} from './registry.js'

const ORIGINAL_EXPERIMENTAL =
  process.env.CHIMERA_EXPERIMENTAL_MODEL_ALLOWLIST

afterEach(() => {
  if (ORIGINAL_EXPERIMENTAL === undefined) {
    delete process.env.CHIMERA_EXPERIMENTAL_MODEL_ALLOWLIST
  } else {
    process.env.CHIMERA_EXPERIMENTAL_MODEL_ALLOWLIST = ORIGINAL_EXPERIMENTAL
  }
})

describe('codex model registry', () => {
  test('lists stable OpenAI and Codex model ids in default selection order', () => {
    delete process.env.CHIMERA_EXPERIMENTAL_MODEL_ALLOWLIST

    expect(listCodexModels().map(model => model.id)).toEqual([
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-5.3-codex',
    ])
  })

  test('hides preview Codex Spark unless experimental models are enabled', () => {
    delete process.env.CHIMERA_EXPERIMENTAL_MODEL_ALLOWLIST
    expect(isKnownCodexModel('gpt-5.3-codex-spark')).toBe(false)

    process.env.CHIMERA_EXPERIMENTAL_MODEL_ALLOWLIST = 'true'
    expect(listCodexModels().map(model => model.id)).toContain(
      'gpt-5.3-codex-spark',
    )
    expect(isKnownCodexModel('gpt-5.3-codex-spark')).toBe(true)
  })

  test('uses gpt-5.5 as the default Codex model', () => {
    expect(getDefaultCodexModel().id).toBe('gpt-5.5')
  })

  test('marks model capabilities for routing and UI decisions', () => {
    expect(getCodexModelConfig('gpt-5.4-mini')).toMatchObject({
      id: 'gpt-5.4-mini',
      contextWindow: 400_000,
      maxOutputTokens: 128_000,
      supportsImages: true,
      supportsTools: true,
      supportsComputerUse: false,
      supportsWebSearch: true,
      supportsFileSearch: true,
    })
  })

  test('tracks real context windows and output limits for every registered model', () => {
    process.env.CHIMERA_EXPERIMENTAL_MODEL_ALLOWLIST = 'true'

    expect(
      Object.fromEntries(
        listCodexModels().map(model => [
          model.id,
          {
            contextWindow: model.contextWindow,
            maxOutputTokens: model.maxOutputTokens,
          },
        ]),
      ),
    ).toEqual({
      'gpt-5.5': { contextWindow: 1_050_000, maxOutputTokens: 128_000 },
      'gpt-5.4': { contextWindow: 1_050_000, maxOutputTokens: 128_000 },
      'gpt-5.4-mini': { contextWindow: 400_000, maxOutputTokens: 128_000 },
      'gpt-5.4-nano': { contextWindow: 400_000, maxOutputTokens: 128_000 },
      'gpt-5.3-codex': { contextWindow: 400_000, maxOutputTokens: 128_000 },
      'gpt-5.3-codex-spark': {
        contextWindow: 128_000,
        maxOutputTokens: 32_000,
      },
    })

    expect(getCodexModelConfig('gpt-5.3-codex-spark', {
      includeExperimental: true,
    })).toMatchObject({
      supportsImages: false,
      supportsComputerUse: false,
    })
  })

  test('normalizes model ids when reading Codex context metadata', () => {
    expect(getCodexModelContextWindow(' GPT-5.5 ')).toBe(1_050_000)
    expect(getCodexModelContextWindow('gpt-unknown')).toBeUndefined()
    expect(getCodexModelMaxOutputTokens('GPT-5.4-NANO')).toBe(128_000)
    expect(getCodexModelMaxOutputTokens('gpt-unknown')).toBeUndefined()
  })

  test('does not treat Anthropic model aliases as known Codex models', () => {
    expect(isKnownCodexModel('sonnet')).toBe(false)
    expect(isKnownCodexModel('opus')).toBe(false)
    expect(isKnownCodexModel('haiku')).toBe(false)
    expect(isKnownCodexModel('claude-sonnet-4-6')).toBe(false)
  })
})
