import { describe, expect, test } from 'bun:test'
import { countCodexRequestTokens, countTranslatedTokens } from './count-tokens.js'
import { translateRequest } from './translate/request.js'

describe('codex token counting', () => {
  test('counts source and translated request shapes', () => {
    const request = {
      model: 'gpt-5.4',
      system: 'You are concise.',
      messages: [{ role: 'user' as const, content: 'hello world' }],
      tools: [
        {
          name: 'Read',
          input_schema: {
            type: 'object',
            properties: { file_path: { type: 'string' } },
          },
        },
      ],
    }
    const translated = translateRequest(request)

    expect(countCodexRequestTokens(request)).toBeGreaterThan(0)
    expect(countTranslatedTokens(translated)).toBeGreaterThan(0)
  })

  test('counts translated OpenAI built-in tools', () => {
    expect(
      countTranslatedTokens({
        input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'search' }] }],
        tools: [
          {
            type: 'web_search',
            filters: {
              allowed_domains: ['openai.com'],
              blocked_domains: ['example.com'],
            },
          },
        ],
      }),
    ).toBeGreaterThan(0)
  })

  test('counts translated computer call outputs', () => {
    expect(
      countTranslatedTokens({
        input: [
          {
            type: 'computer_call_output',
            call_id: 'call_1',
            output: {
              type: 'computer_screenshot',
              image_url: 'data:image/png;base64,abc',
              detail: 'original',
            },
          },
        ],
        tools: [
          {
            type: 'computer',
            display_width: 1024,
            display_height: 768,
            environment: 'browser',
          },
        ],
      }),
    ).toBeGreaterThan(0)
  })
})
