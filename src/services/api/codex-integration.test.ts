import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  clearCodexAuth,
  persistInitialCodexTokens,
  resetCodexAuthCache,
} from '../codex/auth/manager.js'
import { saveCodexTokens } from '../codex/auth/token-store.js'
import { postCodexResponses } from '../codex/client.js'
import { codexToAnthropicEvents } from '../codex/translate/events.js'
import {
  translateRequest,
  type ResponsesRequest,
} from '../codex/translate/request.js'
import { noopCodexLogger } from '../codex/translate/types.js'

const originalFetch = globalThis.fetch
type FetchMock = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>

function setFetchMock(mock: FetchMock): void {
  globalThis.fetch = mock as unknown as typeof fetch
}

describe('codex api integration seam', () => {
  let configHome: string

  beforeEach(async () => {
    configHome = await mkdtemp(join(tmpdir(), 'chimera-api-'))
    process.env.CHIMERA_CONFIG_HOME = configHome
    resetCodexAuthCache()
    await persistInitialCodexTokens({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    })
  })

  afterEach(async () => {
    globalThis.fetch = originalFetch
    await clearCodexAuth()
    resetCodexAuthCache()
    delete process.env.CHIMERA_CONFIG_HOME
    await rm(configHome, { recursive: true, force: true })
  })

  test('streams a single text response as Anthropic-compatible deltas', async () => {
    setFetchMock(async () =>
      new Response(
        sse([
          {
            type: 'response.output_item.added',
            output_index: 0,
            item: { type: 'message', id: 'out_1' },
          },
          {
            type: 'response.output_text.delta',
            output_index: 0,
            delta: 'hello from codex',
          },
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: { type: 'message', id: 'out_1' },
          },
          {
            type: 'response.completed',
            response: { usage: { input_tokens: 3, output_tokens: 4 } },
          },
        ]),
        { headers: { 'content-type': 'text/event-stream' } },
      ))

    const response = await postCodexResponses(baseRequest())
    const events = await collectEvents(response.body)

    expect(events.map(event => event.type)).toEqual([
      'message_start',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop',
    ])
    expect(
      events
        .filter(event => event.type === 'content_block_delta')
        .map(event => ('delta' in event ? event.delta : undefined))
        .filter(delta => delta?.type === 'text_delta')
        .map(delta => delta.text)
        .join(''),
    ).toBe('hello from codex')
  })

  test('streams a Codex function call as an Anthropic tool_use block', async () => {
    setFetchMock(async () =>
      new Response(
        sse([
          {
            type: 'response.output_item.added',
            output_index: 0,
            item: { type: 'function_call', call_id: 'call_1', name: 'Read' },
          },
          {
            type: 'response.function_call_arguments.delta',
            output_index: 0,
            delta: '{"file_path":"README.md"}',
          },
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: { type: 'function_call', call_id: 'call_1', name: 'Read' },
          },
          {
            type: 'response.completed',
            response: { usage: { input_tokens: 3, output_tokens: 6 } },
          },
        ]),
        { headers: { 'content-type': 'text/event-stream' } },
      ))

    const response = await postCodexResponses(baseRequest())
    const events = await collectEvents(response.body)

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'content_block_start',
        content_block: expect.objectContaining({
          type: 'tool_use',
          id: 'call_1',
          name: 'Read',
        }),
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'content_block_delta',
        delta: {
          type: 'input_json_delta',
          partial_json: '{"file_path":"README.md"}',
        },
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'message_delta',
        delta: expect.objectContaining({ stop_reason: 'tool_use' }),
      }),
    )
  })

  test('maps 429 responses to rate limit errors', async () => {
    setFetchMock(async () =>
      new Response('slow down', {
        status: 429,
        headers: { 'retry-after': '2' },
      }))

    await expect(postCodexResponses(baseRequest())).rejects.toMatchObject({
      status: 429,
      type: 'rate_limit_error',
      retryAfter: '2',
    })
  })

  test('translates tool results into Codex function_call_output items', () => {
    const request = translateRequest({
      model: 'gpt-5.4',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call_1',
              name: 'Read',
              input: { file_path: 'README.md' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_1',
              content: 'file contents',
            },
          ],
        },
      ],
    })

    expect(request.input).toContainEqual({
      type: 'function_call',
      call_id: 'call_1',
      name: 'Read',
      arguments: '{"file_path":"README.md"}',
    })
    expect(request.input).toContainEqual({
      type: 'function_call_output',
      call_id: 'call_1',
      output: 'file contents',
    })
  })

  test('refreshes an expired token before posting the Codex request', async () => {
    await saveCodexTokens({
      access_token: 'expired-token',
      refresh_token: 'refresh-token',
      expires_at: Date.now() - 1000,
    })
    resetCodexAuthCache()

    const authorizations: string[] = []
    setFetchMock(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/oauth/token')) {
        return Response.json({
          access_token: 'fresh-token',
          expires_in: 3600,
        })
      }
      authorizations.push(new Headers(init?.headers).get('authorization') ?? '')
      return new Response(sse([{ type: 'response.completed', response: {} }]), {
        headers: { 'content-type': 'text/event-stream' },
      })
    })

    await postCodexResponses(baseRequest())
    expect(authorizations).toEqual(['Bearer fresh-token'])
  })
})

async function collectEvents(upstream: ReadableStream<Uint8Array>) {
  const events = []
  for await (const event of codexToAnthropicEvents(upstream, {
    messageId: 'msg_test',
    model: 'gpt-5.4',
    log: noopCodexLogger,
  })) {
    events.push(event)
  }
  return events
}

function baseRequest(): ResponsesRequest {
  return {
    model: 'gpt-5.4',
    input: [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'hi' }],
      },
    ],
    store: false,
    stream: true,
    text: { verbosity: 'low' },
  }
}

function sse(payloads: unknown[]): string {
  return payloads
    .map(payload => {
      const type =
        typeof payload === 'object' && payload && 'type' in payload
          ? String(payload.type)
          : 'message'
      return [`event: ${type}`, `data: ${JSON.stringify(payload)}`, ''].join(
        '\n',
      )
    })
    .join('\n')
}
