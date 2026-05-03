import { afterEach, describe, expect, test } from 'bun:test'
import { translateRequest } from './request.js'
import type { AnthropicRequest } from './types.js'

const ORIGINAL_EFFORT = process.env.CHIMERA_REASONING_EFFORT
const ORIGINAL_MODEL = process.env.CHIMERA_MODEL

afterEach(() => {
  restoreEnv('CHIMERA_REASONING_EFFORT', ORIGINAL_EFFORT)
  restoreEnv('CHIMERA_MODEL', ORIGINAL_MODEL)
})

const baseRequest: AnthropicRequest = {
  model: 'gpt-5.4',
  messages: [{ role: 'user', content: 'hello' }],
}

describe('translateRequest', () => {
  test('omits reasoning include when reasoning is not enabled', () => {
    const translated = translateRequest(baseRequest)

    expect(translated.model).toBe('gpt-5.4')
    expect(translated.reasoning).toBeUndefined()
    expect(translated.include).toBeUndefined()
  })

  test('includes encrypted reasoning content when reasoning is enabled', () => {
    const translated = translateRequest({
      ...baseRequest,
      output_config: { effort: 'medium' },
    })

    expect(translated.reasoning).toEqual({ effort: 'medium' })
    expect(translated.include).toEqual(['reasoning.encrypted_content'])
  })

  test('maps text, image, tool call, and tool result items', () => {
    const translated = translateRequest({
      model: 'gpt-5.4',
      system: 'follow instructions',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'look' },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'abc' },
            },
          ],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'reading' },
            { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: 'README.md' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_1', content: 'done' },
          ],
        },
      ],
    })

    expect(translated.instructions).toBe('follow instructions')
    expect(translated.model).toBe('gpt-5.4')
    expect(translated.input).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'look' },
          { type: 'input_image', image_url: 'data:image/png;base64,abc' },
        ],
      },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'reading' }],
      },
      {
        type: 'function_call',
        call_id: 'toolu_1',
        name: 'Read',
        arguments: '{"file_path":"README.md"}',
      },
      {
        type: 'function_call_output',
        call_id: 'toolu_1',
        output: 'done',
      },
    ])
  })

  test('maps errored tool results to model-visible function_call_output errors', () => {
    const translated = translateRequest({
      model: 'gpt-5.4',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call_permission_deny',
              name: 'Bash',
              input: { command: 'printf denied' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_permission_deny',
              content:
                "Claude requested permissions to use Bash, but you haven't granted it yet.",
              is_error: true,
            },
          ],
        },
      ],
    })

    expect(translated.input).toEqual([
      {
        type: 'function_call',
        call_id: 'call_permission_deny',
        name: 'Bash',
        arguments: '{"command":"printf denied"}',
      },
      {
        type: 'function_call_output',
        call_id: 'call_permission_deny',
        output:
          "[tool execution error]\nClaude requested permissions to use Bash, but you haven't granted it yet.",
      },
    ])
  })

  test('flushes user text before and after tool results without losing call order', () => {
    const translated = translateRequest({
      model: 'gpt-5.4',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call_read',
              name: 'Read',
              input: { file_path: 'README.md' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'before result' },
            {
              type: 'tool_result',
              tool_use_id: 'call_read',
              content: 'README contents',
            },
            { type: 'text', text: 'after result' },
          ],
        },
      ],
    })

    expect(translated.input).toEqual([
      {
        type: 'function_call',
        call_id: 'call_read',
        name: 'Read',
        arguments: '{"file_path":"README.md"}',
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'before result' }],
      },
      {
        type: 'function_call_output',
        call_id: 'call_read',
        output: 'README contents',
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'after result' }],
      },
    ])
  })

  test('returns only expected top-level upstream request fields', () => {
    const translated = translateRequest({
      ...baseRequest,
      system: 'follow instructions',
      tools: [
        {
          name: 'lookup_weather',
          description: 'Look up the weather',
          input_schema: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'lookup_weather' },
      output_config: {
        effort: 'high',
        format: {
          type: 'json_schema',
          name: 'weather_response',
          schema: {
            type: 'object',
            properties: { forecast: { type: 'string' } },
            required: ['forecast'],
          },
        },
      },
    })

    expect(Object.keys(translated).sort()).toEqual([
      'include',
      'input',
      'instructions',
      'model',
      'parallel_tool_calls',
      'reasoning',
      'store',
      'stream',
      'text',
      'tool_choice',
      'tools',
    ])
  })

  test('tolerates transcript document blocks without a source', () => {
    const translated = translateRequest({
      ...baseRequest,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'continue' },
            { type: 'document', title: 'web-search-result' } as never,
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'web_search',
              content: [
                { type: 'text', text: 'result text' },
                { type: 'document', title: 'nested-result' } as never,
              ],
            },
          ],
        },
      ],
    })

    expect(translated.input).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'continue' },
          {
            type: 'input_text',
            text: '[document attachment: web-search-result]',
          },
        ],
      },
      {
        type: 'function_call_output',
        call_id: 'web_search',
        output: 'result text\n[document omitted: nested-result]',
      },
    ])
  })

  test('rejects Anthropic model aliases before upstream translation', () => {
    expect(() =>
      translateRequest({
        ...baseRequest,
        model: 'sonnet',
      }),
    ).toThrow(/Choose an OpenAI model/)
  })
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
