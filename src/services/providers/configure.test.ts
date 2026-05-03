import { describe, expect, test } from 'bun:test'
import {
  buildProviderApiKeySettings,
  buildProviderApiKeyRemovalSettings,
  resolveAuthProviderChoice,
  resolveProviderChoice,
} from './configure.js'

describe('provider CLI configuration helpers', () => {
  test('resolves provider by id, case-insensitively', () => {
    expect(resolveProviderChoice('OpenRouter')?.id).toBe('openrouter')
  })

  test('resolves provider by one-based list number', () => {
    expect(resolveProviderChoice('1')?.id).toBe('302ai')
  })

  test('returns undefined for unknown provider choices', () => {
    expect(resolveProviderChoice('no-such-provider')).toBeUndefined()
    expect(resolveProviderChoice('9999')).toBeUndefined()
  })

  test('builds a user settings update without dropping existing provider config', () => {
    expect(
      buildProviderApiKeySettings(
        {
          provider: {
            openrouter: {
              models: {
                'openai/gpt-5.4': { name: 'GPT-5.4 via OpenRouter' },
              },
              options: {
                baseURL: 'https://custom.example/v1',
              },
            },
          },
        },
        'openrouter',
        'sk-test',
      ),
    ).toEqual({
      provider: {
        openrouter: {
          models: {
            'openai/gpt-5.4': { name: 'GPT-5.4 via OpenRouter' },
          },
          options: {
            baseURL: 'https://custom.example/v1',
            apiKey: 'sk-test',
          },
        },
      },
    })
  })

  test('resolves codex as the first unified auth provider', () => {
    expect(resolveAuthProviderChoice('1')?.kind).toBe('codex')
    expect(resolveAuthProviderChoice('codex')?.kind).toBe('codex')
    expect(resolveAuthProviderChoice('chatgpt')?.kind).toBe('codex')
  })

  test('resolves external providers after the codex auth row', () => {
    const choice = resolveAuthProviderChoice('2')
    expect(choice?.kind).toBe('external')
    if (choice?.kind === 'external') {
      expect(choice.provider.id).toBe('302ai')
    }
  })

  test('builds an API key removal update without dropping provider options', () => {
    expect(
      buildProviderApiKeyRemovalSettings(
        {
          provider: {
            openrouter: {
              options: {
                baseURL: 'https://custom.example/v1',
                apiKey: 'sk-test',
              },
            },
          },
        },
        'openrouter',
      ),
    ).toEqual({
      provider: {
        openrouter: {
          options: {
            baseURL: 'https://custom.example/v1',
            apiKey: undefined,
          },
        },
      },
    })
  })
})
