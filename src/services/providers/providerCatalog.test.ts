import { describe, expect, test } from 'bun:test'
import {
  getConfiguredExternalModelOptions,
  getProviderCatalog,
  isKnownProviderId,
  parseProviderModel,
  resolveModelSelection,
} from './catalog.js'

describe('OpenCode-compatible provider catalog', () => {
  test('includes the provider set carried by the OpenCode models fixture', () => {
    const providers = getProviderCatalog()

    expect(providers.length).toBeGreaterThanOrEqual(90)
    expect(isKnownProviderId('openrouter')).toBe(true)
    expect(isKnownProviderId('github-copilot')).toBe(true)
    expect(isKnownProviderId('anthropic')).toBe(true)
    expect(isKnownProviderId('cloudflare-ai-gateway')).toBe(true)
    expect(isKnownProviderId('kilo')).toBe(true)
  })

  test('parses provider/model selections without damaging nested model ids', () => {
    expect(parseProviderModel('openrouter/anthropic/claude-sonnet-4.5')).toEqual(
      {
        providerId: 'openrouter',
        modelId: 'anthropic/claude-sonnet-4.5',
      },
    )
    expect(parseProviderModel('gpt-5.5')).toBeNull()
  })

  test('keeps bare OpenAI models on Codex and external models on their provider', () => {
    expect(resolveModelSelection('gpt-5.5')).toEqual({
      providerId: 'codex',
      modelId: 'gpt-5.5',
      source: 'codex-default',
    })
    expect(resolveModelSelection('openai/gpt-5.5')).toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.5',
      source: 'external-provider',
    })
    expect(resolveModelSelection('sonnet')).toEqual({
      providerId: 'codex',
      modelId: 'sonnet',
      source: 'codex-default',
    })
  })

  test('turns configured provider models into picker options', () => {
    expect(
      getConfiguredExternalModelOptions({
        openrouter: {
          models: {
            'anthropic/claude-sonnet-4.5': {
              name: 'Claude Sonnet 4.5 via OpenRouter',
            },
          },
        },
        groq: {
          models: {
            'llama-3.3-70b-versatile': {},
          },
        },
      }),
    ).toEqual([
      {
        value: 'openrouter/anthropic/claude-sonnet-4.5',
        label: 'Claude Sonnet 4.5 via OpenRouter',
        description: 'OpenRouter · anthropic/claude-sonnet-4.5',
      },
      {
        value: 'groq/llama-3.3-70b-versatile',
        label: 'llama-3.3-70b-versatile',
        description: 'Groq · llama-3.3-70b-versatile',
      },
    ])
  })
})
