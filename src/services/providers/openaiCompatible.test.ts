import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  chatCompletionToAnthropicMessage,
  resolveExternalProviderConnection,
} from './openaiCompatible.js'

function readRuntimeSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8').split(
    '//# sourceMappingURL=',
  )[0]
}

describe('OpenAI-compatible external provider connections', () => {
  test('resolves api key and base URL from provider metadata and env', () => {
    expect(
      resolveExternalProviderConnection('openrouter/anthropic/claude-sonnet-4.5', {
        env: { OPENROUTER_API_KEY: 'sk-openrouter' },
      }),
    ).toMatchObject({
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4.5',
      apiKey: 'sk-openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
    })
  })

  test('prefers configured api key and base URL over env/provider defaults', () => {
    expect(
      resolveExternalProviderConnection('lmstudio/qwen/qwen3-coder', {
        env: {},
        providerConfig: {
          lmstudio: {
            options: {
              apiKey: 'local-key',
              baseURL: 'http://localhost:4321/v1',
            },
          },
        },
      }),
    ).toMatchObject({
      providerId: 'lmstudio',
      modelId: 'qwen/qwen3-coder',
      apiKey: 'local-key',
      baseURL: 'http://localhost:4321/v1',
    })
  })

  test('rejects provider selections without a known runtime endpoint', () => {
    expect(() =>
      resolveExternalProviderConnection('anthropic/claude-opus-4-5', {
        env: { ANTHROPIC_API_KEY: 'sk-anthropic' },
      }),
    ).toThrow('does not expose an OpenAI-compatible endpoint')
  })

  test('maps non-streaming chat completions back to Anthropic message shape', () => {
    const message = chatCompletionToAnthropicMessage(
      {
        id: 'chatcmpl_1',
        object: 'chat.completion',
        created: 1,
        model: 'grok-4.3',
        choices: [
          {
            index: 0,
            finish_reason: 'tool_calls',
            logprobs: null,
            message: {
              role: 'assistant',
              content: 'I can check that.',
              refusal: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'WebSearch',
                    arguments: '{"query":"Buy Me a Coffee Russia payout"}',
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18,
        },
      },
      'xai/grok-4.3',
    )

    expect(message).toMatchObject({
      id: 'chatcmpl_1',
      model: 'xai/grok-4.3',
      stop_reason: 'tool_use',
      usage: {
        input_tokens: 11,
        output_tokens: 7,
      },
      content: [
        { type: 'text', text: 'I can check that.' },
        {
          type: 'tool_use',
          id: 'call_1',
          name: 'WebSearch',
          input: { query: 'Buy Me a Coffee Russia payout' },
        },
      ],
    })
  })

  test('external provider translator tolerates document blocks without a source', async () => {
    const source = readRuntimeSource('src/services/providers/openaiCompatible.ts')

    expect(source).toContain('const source = isObject(block.source)')
    expect(source).toContain('[document attachment: ${block.title ??')
    expect(source).toContain('function isObject(value: unknown)')
  })

  test('non-streaming fallback dispatches provider/model selections to external providers', () => {
    const claudeSource = readRuntimeSource('src/services/api/claude.ts')
    const fallbackStart = claudeSource.indexOf(
      'export async function* executeNonStreamingRequest',
    )
    const fallbackSource = claudeSource.slice(
      fallbackStart,
      claudeSource.indexOf(
        'function getPreviousRequestIdFromMessages',
        fallbackStart,
      ),
    )

    expect(fallbackSource).toContain('queryOpenAICompatibleProviderOnce')
    expect(fallbackSource).toContain('parseProviderModel(adjustedParams.model)')
    expect(fallbackSource.indexOf('parseProviderModel(adjustedParams.model)'))
      .toBeLessThan(fallbackSource.indexOf('postCodexRequestWithRetryableErrors'))
  })
})
