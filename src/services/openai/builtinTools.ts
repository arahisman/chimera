import { randomUUID } from 'crypto'
import { postCodexResponses, type CodexResponse } from '../codex/client.js'
import type { ResponsesRequest } from '../codex/translate/request.js'
import { parseSseStream } from '../codex/translate/sse.js'
import { getDefaultCodexModel } from '../codex/models/registry.js'

export type CodexWebSearchInput = {
  query: string
  allowed_domains?: string[]
  blocked_domains?: string[]
}

export type CodexWebSearchSource = {
  title: string
  url: string
}

export type CodexWebSearchResult = {
  tool_use_id: string
  content: CodexWebSearchSource[]
}

export type CodexWebSearchOutput = {
  query: string
  results: Array<CodexWebSearchResult | string>
  durationSeconds: number
}

type RunCodexWebSearchOptions = {
  model?: string
  sessionId?: string
  signal?: AbortSignal
  postResponses?: (
    body: ResponsesRequest,
    options?: { sessionId?: string; signal?: AbortSignal },
  ) => Promise<CodexResponse>
  now?: () => number
}

const WEB_SEARCH_SOURCES_INCLUDE = 'web_search_call.action.sources'
export function buildCodexWebSearchRequest(
  input: CodexWebSearchInput,
  options: { model?: string } = {},
): ResponsesRequest {
  const allowedDomains = normalizeDomains(input.allowed_domains)
  const blockedDomains = normalizeDomains(input.blocked_domains)
  const filters = {
    ...(allowedDomains.length ? { allowed_domains: allowedDomains } : {}),
    ...(blockedDomains.length ? { blocked_domains: blockedDomains } : {}),
  }
  const tool: NonNullable<ResponsesRequest['tools']>[number] = {
    type: 'web_search',
    ...(Object.keys(filters).length ? { filters } : {}),
  }

  return {
    model: options.model ?? getDefaultCodexModel().id,
    instructions:
      'Use OpenAI web_search to answer the search request. Return concise findings and preserve cited source annotations.',
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: buildSearchPrompt(input),
          },
        ],
      },
    ],
    tools: [tool],
    tool_choice: 'auto',
    include: [WEB_SEARCH_SOURCES_INCLUDE],
    store: false,
    stream: true,
    text: { verbosity: 'low' },
  }
}

export async function runCodexWebSearch(
  input: CodexWebSearchInput,
  options: RunCodexWebSearchOptions = {},
): Promise<CodexWebSearchOutput> {
  const now = options.now ?? performance.now.bind(performance)
  const start = now()

  const request = buildCodexWebSearchRequest(input, { model: options.model })
  const postResponses = options.postResponses ?? postCodexResponses
  const response = await postResponses(request, {
    sessionId: options.sessionId ?? `web_search_${randomUUID()}`,
    signal: options.signal,
  })

  return collectCodexWebSearchOutput(response.body, {
    query: input.query,
    durationSeconds: (now() - start) / 1000,
  })
}

export async function collectCodexWebSearchOutput(
  body: ReadableStream<Uint8Array>,
  options: { query: string; durationSeconds: number },
): Promise<CodexWebSearchOutput> {
  let text = ''
  const sources = new Map<string, CodexWebSearchSource>()

  for await (const event of parseSseStream(body)) {
    if (!event.data) continue
    let payload: any
    try {
      payload = JSON.parse(event.data)
    } catch {
      continue
    }
    if (payload.type === 'response.output_text.delta') {
      text += payload.delta ?? ''
      continue
    }
    if (payload.type === 'response.output_item.done') {
      collectSourcesFromItem(payload.item, sources)
    }
  }

  const results: Array<CodexWebSearchResult | string> = []
  const trimmed = text.trim()
  if (trimmed) results.push(trimmed)
  if (sources.size > 0) {
    results.push({
      tool_use_id: 'web_search',
      content: Array.from(sources.values()),
    })
  }
  if (results.length === 0) {
    results.push('No web search results were returned.')
  }

  return {
    query: options.query,
    results,
    durationSeconds: options.durationSeconds,
  }
}

function collectSourcesFromItem(
  item: unknown,
  sources: Map<string, CodexWebSearchSource>,
): void {
  if (!item || typeof item !== 'object') return
  const record = item as Record<string, unknown>
  collectSourcesFromWebSearchAction(record.action, sources)
  collectSourcesFromMessageContent(record.content, sources)
}

function collectSourcesFromWebSearchAction(
  action: unknown,
  sources: Map<string, CodexWebSearchSource>,
): void {
  if (!action || typeof action !== 'object') return
  const maybeSources = (action as { sources?: unknown }).sources
  if (!Array.isArray(maybeSources)) return
  for (const source of maybeSources) {
    addSource(source, sources)
  }
}

function collectSourcesFromMessageContent(
  content: unknown,
  sources: Map<string, CodexWebSearchSource>,
): void {
  if (!Array.isArray(content)) return
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const annotations = (part as { annotations?: unknown }).annotations
    if (!Array.isArray(annotations)) continue
    for (const annotation of annotations) {
      addSource(annotation, sources)
    }
  }
}

function addSource(
  source: unknown,
  sources: Map<string, CodexWebSearchSource>,
): void {
  if (!source || typeof source !== 'object') return
  const record = source as Record<string, unknown>
  if (record.type !== undefined && record.type !== 'url_citation') return
  if (typeof record.url !== 'string' || !record.url) return
  const title = typeof record.title === 'string' && record.title
    ? record.title
    : record.url
  if (!sources.has(record.url)) {
    sources.set(record.url, { title, url: record.url })
  }
}

function buildSearchPrompt(input: CodexWebSearchInput): string {
  const allowedDomains = normalizeDomains(input.allowed_domains)
  const blockedDomains = normalizeDomains(input.blocked_domains)
  const hints = [
    allowedDomains.length
      ? `Limit results to these domains: ${allowedDomains.join(', ')}.`
      : '',
    blockedDomains.length
      ? `Do not use results from these domains: ${blockedDomains.join(', ')}.`
      : '',
  ].filter(Boolean)
  return `Search the web for: ${input.query}.${hints.length ? `\n${hints.join('\n')}` : ''}`
}

function normalizeDomains(domains: string[] | undefined): string[] {
  return (domains ?? [])
    .map(domain => domain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
    .filter(Boolean)
}
