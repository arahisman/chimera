import { describe, expect, test } from 'bun:test'
import { runProviderNativeWebSearch } from './webSearch.js'

describe('provider-native web search', () => {
  test('falls back to Codex OAuth search for bare Codex models', async () => {
    const output = await runProviderNativeWebSearch(
      { query: 'chimera web search' },
      {
        model: 'gpt-5.5',
        now: fixedClock(),
        runCodexSearch: async input => ({
          query: input.query,
          durationSeconds: 0.5,
          results: ['codex result'],
        }),
      },
    )

    expect(output).toEqual({
      query: 'chimera web search',
      durationSeconds: 0.5,
      results: ['codex result'],
    })
  })

  test('falls back to the default Codex search model for unsupported external providers', async () => {
    let seenModel: string | undefined
    const output = await runProviderNativeWebSearch(
      { query: 'mistral search fallback' },
      {
        model: 'mistral/mistral-large-latest',
        now: fixedClock(),
        runCodexSearch: async (input, options) => {
          seenModel = options?.model
          return {
            query: input.query,
            durationSeconds: 0.25,
            results: ['fallback result'],
          }
        },
      },
    )

    expect(seenModel).toBeUndefined()
    expect(output.results).toEqual(['fallback result'])
  })

  test('uses xAI Responses web_search with excluded domain filters', async () => {
    let seenUrl = ''
    let seenRequest: any
    let seenAuth = ''
    const output = await runProviderNativeWebSearch(
      {
        query: 'Buy Me a Coffee Russia payout',
        blocked_domains: ['spam.example'],
      },
      {
        model: 'xai/grok-4.3',
        env: { XAI_API_KEY: 'xai-key' },
        now: fixedClock(),
        fetchImpl: async (url, init) => {
          seenUrl = String(url)
          seenAuth = new Headers(init?.headers).get('authorization') ?? ''
          seenRequest = JSON.parse(String(init?.body))
          return jsonResponse({
            output_text: 'xAI searched the web.',
            citations: [{ title: 'xAI Docs', url: 'https://docs.x.ai/' }],
          })
        },
      },
    )

    expect(seenUrl).toBe('https://api.x.ai/v1/responses')
    expect(seenAuth).toBe('Bearer xai-key')
    expect(seenRequest).toMatchObject({
      model: 'grok-4.3',
      tools: [
        {
          type: 'web_search',
          filters: {
            excluded_domains: ['spam.example'],
          },
        },
      ],
    })
    expect(output.results).toEqual([
      'xAI searched the web.',
      {
        tool_use_id: 'web_search',
        content: [{ title: 'xAI Docs', url: 'https://docs.x.ai/' }],
      },
    ])
  })

  test('uses Perplexity Search API for Perplexity provider models', async () => {
    let seenRequest: any
    const output = await runProviderNativeWebSearch(
      {
        query: 'provider native search',
        allowed_domains: ['docs.perplexity.ai'],
      },
      {
        model: 'perplexity/sonar',
        env: { PERPLEXITY_API_KEY: 'pplx-key' },
        now: fixedClock(),
        fetchImpl: async (_url, init) => {
          seenRequest = JSON.parse(String(init?.body))
          return jsonResponse({
            results: [
              {
                title: 'Search Quickstart',
                url: 'https://docs.perplexity.ai/docs/search/quickstart',
                snippet: 'Use POST /search.',
              },
            ],
          })
        },
      },
    )

    expect(seenRequest).toMatchObject({
      query: 'provider native search',
      search_domain_filter: ['docs.perplexity.ai'],
    })
    expect(output.results).toEqual([
      'Perplexity returned 1 ranked web results:\n- Search Quickstart: Use POST /search.',
      {
        tool_use_id: 'web_search',
        content: [
          {
            title: 'Search Quickstart',
            url: 'https://docs.perplexity.ai/docs/search/quickstart',
          },
        ],
      },
    ])
  })

  test('uses OpenRouter web_search server tool for OpenRouter models', async () => {
    let seenUrl = ''
    let seenRequest: any
    const output = await runProviderNativeWebSearch(
      {
        query: 'OpenRouter native web search',
        allowed_domains: ['openrouter.ai'],
        blocked_domains: ['reddit.com'],
      },
      {
        model: 'openrouter/openai/gpt-5.5',
        env: { OPENROUTER_API_KEY: 'or-key' },
        now: fixedClock(),
        fetchImpl: async (url, init) => {
          seenUrl = String(url)
          seenRequest = JSON.parse(String(init?.body))
          return jsonResponse({
            output_text: 'OpenRouter searched.',
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: 'OpenRouter searched.',
                    annotations: [
                      {
                        type: 'url_citation',
                        title: 'OpenRouter Web Search',
                        url: 'https://openrouter.ai/docs/guides/features/server-tools/web-search',
                      },
                    ],
                  },
                ],
              },
            ],
          })
        },
      },
    )

    expect(seenUrl).toBe('https://openrouter.ai/api/v1/responses')
    expect(seenRequest).toMatchObject({
      model: 'openai/gpt-5.5',
      tools: [
        {
          type: 'openrouter:web_search',
          parameters: {
            max_results: 5,
            allowed_domains: ['openrouter.ai'],
            excluded_domains: ['reddit.com'],
          },
        },
      ],
    })
    expect(output.results).toEqual([
      'OpenRouter searched.',
      {
        tool_use_id: 'web_search',
        content: [
          {
            title: 'OpenRouter Web Search',
            url: 'https://openrouter.ai/docs/guides/features/server-tools/web-search',
          },
        ],
      },
    ])
  })

  test('uses Gemini Google Search grounding and extracts grounding chunks', async () => {
    let seenUrl = ''
    let seenRequest: any
    const output = await runProviderNativeWebSearch(
      { query: 'grounded search' },
      {
        model: 'google/gemini-2.5-flash',
        env: { GEMINI_API_KEY: 'gemini-key' },
        now: fixedClock(),
        fetchImpl: async (url, init) => {
          seenUrl = String(url)
          seenRequest = JSON.parse(String(init?.body))
          return jsonResponse({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Gemini grounded this answer.' }],
                },
                groundingMetadata: {
                  groundingChunks: [
                    {
                      web: {
                        title: 'Gemini Grounding',
                        uri: 'https://ai.google.dev/gemini-api/docs/grounding',
                      },
                    },
                  ],
                },
              },
            ],
          })
        },
      },
    )

    expect(seenUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    )
    expect(seenRequest.tools).toEqual([{ google_search: {} }])
    expect(output.results).toEqual([
      'Gemini grounded this answer.',
      {
        tool_use_id: 'web_search',
        content: [
          {
            title: 'Gemini Grounding',
            url: 'https://ai.google.dev/gemini-api/docs/grounding',
          },
        ],
      },
    ])
  })

  test('uses Anthropic web_search_20250305 for Anthropic provider models', async () => {
    let seenRequest: any
    const output = await runProviderNativeWebSearch(
      {
        query: 'anthropic web search',
        allowed_domains: ['docs.anthropic.com'],
      },
      {
        model: 'anthropic/claude-sonnet-4-5',
        env: { ANTHROPIC_API_KEY: 'anthropic-key' },
        now: fixedClock(),
        fetchImpl: async (_url, init) => {
          seenRequest = JSON.parse(String(init?.body))
          return jsonResponse({
            content: [
              {
                type: 'text',
                text: 'Anthropic searched.',
                citations: [
                  {
                    title: 'Anthropic Web Search',
                    url: 'https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool',
                  },
                ],
              },
            ],
          })
        },
      },
    )

    expect(seenRequest.tools).toEqual([
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
        allowed_domains: ['docs.anthropic.com'],
      },
    ])
    expect(output.results).toEqual([
      'Anthropic searched.',
      {
        tool_use_id: 'web_search',
        content: [
          {
            title: 'Anthropic Web Search',
            url: 'https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool',
          },
        ],
      },
    ])
  })
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function fixedClock(): () => number {
  let now = 1000
  return () => {
    now += 250
    return now
  }
}
