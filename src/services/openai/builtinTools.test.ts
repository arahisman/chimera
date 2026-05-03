import { describe, expect, test } from 'bun:test'
import {
  buildCodexWebSearchRequest,
  collectCodexWebSearchOutput,
  runCodexWebSearch,
} from './builtinTools.js'

describe('OpenAI built-in tools', () => {
  test('builds a Responses web_search request with domain filters and sources include', () => {
    const request = buildCodexWebSearchRequest({
      query: 'latest codex release notes',
      allowed_domains: ['openai.com', 'help.openai.com'],
      blocked_domains: ['example.com'],
    })

    expect(request.store).toBe(false)
    expect(request.stream).toBe(true)
    expect(request.tool_choice).toBe('auto')
    expect(request.include).toEqual(['web_search_call.action.sources'])
    expect(request.tools).toEqual([
      {
        type: 'web_search',
        filters: {
          allowed_domains: ['openai.com', 'help.openai.com'],
          blocked_domains: ['example.com'],
        },
      },
    ])
    expect(JSON.stringify(request.input)).toContain('latest codex release notes')
  })

  test('collects text, citation annotations, and web_search_call sources from SSE', async () => {
    const stream = streamFromSse([
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'web_search_call', id: 'ws_123' },
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'web_search_call',
          id: 'ws_123',
          action: {
            type: 'search',
            sources: [
              {
                title: 'OpenAI Codex',
                url: 'https://openai.com/codex',
              },
            ],
          },
        },
      },
      {
        type: 'response.output_item.added',
        output_index: 1,
        item: { type: 'message', id: 'msg_1' },
      },
      {
        type: 'response.output_text.delta',
        output_index: 1,
        delta: 'Codex can search the web.',
      },
      {
        type: 'response.output_item.done',
        output_index: 1,
        item: {
          type: 'message',
          id: 'msg_1',
          content: [
            {
              type: 'output_text',
              text: 'Codex can search the web.',
              annotations: [
                {
                  type: 'url_citation',
                  title: 'OpenAI Docs',
                  url: 'https://platform.openai.com/docs/guides/tools-web-search',
                },
              ],
            },
          ],
        },
      },
      {
        type: 'response.completed',
        response: { usage: { input_tokens: 5, output_tokens: 7 } },
      },
    ])

    const output = await collectCodexWebSearchOutput(stream, {
      query: 'codex web search',
      durationSeconds: 1.25,
    })

    expect(output).toEqual({
      query: 'codex web search',
      durationSeconds: 1.25,
      results: [
        'Codex can search the web.',
        {
          tool_use_id: 'web_search',
          content: [
            {
              title: 'OpenAI Codex',
              url: 'https://openai.com/codex',
            },
            {
              title: 'OpenAI Docs',
              url: 'https://platform.openai.com/docs/guides/tools-web-search',
            },
          ],
        },
      ],
    })
  })

  test('passes blocked domain filters to upstream web_search', async () => {
    let seenRequest: unknown
    const output = await runCodexWebSearch(
      {
        query: 'search while excluding a site',
        blocked_domains: ['example.com'],
      },
      {
        model: 'gpt-5.4',
        postResponses: async request => {
          seenRequest = request
          return {
            status: 200,
            headers: new Headers(),
            body: streamFromSse([
              {
                type: 'response.output_item.added',
                output_index: 0,
                item: { type: 'message', id: 'msg_1' },
              },
              {
                type: 'response.output_text.delta',
                output_index: 0,
                delta: 'filtered result',
              },
              {
                type: 'response.completed',
                response: { usage: { input_tokens: 1, output_tokens: 1 } },
              },
            ]),
          }
        },
      },
    )

    expect(JSON.stringify(seenRequest)).toContain('"blocked_domains":["example.com"]')
    expect(output.results).toEqual(['filtered result'])
  })
})

function streamFromSse(payloads: unknown[]): ReadableStream<Uint8Array> {
  const body =
    payloads
      .map(payload => {
        const type =
          typeof payload === 'object' && payload && 'type' in payload
            ? String((payload as { type: unknown }).type)
            : 'message'
        return [`event: ${type}`, `data: ${JSON.stringify(payload)}`, ''].join(
          '\n',
        )
      })
      .join('\n') + '\n'
  return new Response(body).body!
}
