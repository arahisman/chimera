import {
  buildCodexWebSearchRequest,
  runCodexWebSearch,
  type CodexWebSearchInput,
  type CodexWebSearchOutput,
  type CodexWebSearchSource,
} from '../openai/builtinTools.js'
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'
import {
  getProviderInfo,
  parseProviderModel,
  type ExternalProviderConfig,
} from './catalog.js'

type ProviderWebSearchOptions = {
  model?: string
  signal?: AbortSignal
  env?: Record<string, string | undefined>
  providerConfig?: Record<string, ExternalProviderConfig>
  fetchImpl?: typeof fetch
  now?: () => number
  runCodexSearch?: typeof runCodexWebSearch
}

type JsonRecord = Record<string, unknown>

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses'
const OPENROUTER_RESPONSES_URL = 'https://openrouter.ai/api/v1/responses'
const PERPLEXITY_SEARCH_URL = 'https://api.perplexity.ai/search'
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

export async function runProviderNativeWebSearch(
  input: CodexWebSearchInput,
  options: ProviderWebSearchOptions = {},
): Promise<CodexWebSearchOutput> {
  const model = options.model?.trim()
  const selection = model ? parseProviderModel(model) : null
  if (!selection) {
    return runCodexFallback(input, options)
  }

  switch (selection.providerId) {
    case 'openai':
      return runOpenAIResponsesWebSearch(input, selection.modelId, options)
    case 'xai':
      return runXAIResponsesWebSearch(input, selection.modelId, options)
    case 'openrouter':
      return runOpenRouterWebSearch(input, selection.modelId, options)
    case 'google':
      return runGoogleGroundedWebSearch(input, selection.modelId, options)
    case 'perplexity':
    case 'perplexity-agent':
      return runPerplexitySearch(input, options)
    case 'anthropic':
      return runAnthropicWebSearch(input, selection.modelId, options)
    default:
      return runCodexFallback(input, options)
  }
}

async function runCodexFallback(
  input: CodexWebSearchInput,
  options: ProviderWebSearchOptions,
): Promise<CodexWebSearchOutput> {
  const runner = options.runCodexSearch ?? runCodexWebSearch
  const fallbackModel = options.model && !parseProviderModel(options.model)
    ? options.model
    : undefined
  return runner(input, {
    model: fallbackModel,
    signal: options.signal,
    now: options.now,
  })
}

async function runOpenAIResponsesWebSearch(
  input: CodexWebSearchInput,
  model: string,
  options: ProviderWebSearchOptions,
): Promise<CodexWebSearchOutput> {
  const request = {
    ...buildCodexWebSearchRequest(input, { model }),
    stream: false,
  }
  return runResponsesJsonWebSearch({
    providerId: 'openai',
    input,
    options,
    url: OPENAI_RESPONSES_URL,
    body: request,
  })
}

async function runXAIResponsesWebSearch(
  input: CodexWebSearchInput,
  model: string,
  options: ProviderWebSearchOptions,
): Promise<CodexWebSearchOutput> {
  const allowedDomains = normalizeDomains(input.allowed_domains)
  const blockedDomains = normalizeDomains(input.blocked_domains)
  const filters = {
    ...(allowedDomains.length ? { allowed_domains: allowedDomains } : {}),
    ...(blockedDomains.length ? { excluded_domains: blockedDomains } : {}),
  }
  const tool = {
    type: 'web_search',
    ...(Object.keys(filters).length ? { filters } : {}),
  }

  return runResponsesJsonWebSearch({
    providerId: 'xai',
    input,
    options,
    url: XAI_RESPONSES_URL,
    body: {
      model,
      input: [{ role: 'user', content: buildSearchPrompt(input) }],
      tools: [tool],
      store: false,
    },
  })
}

async function runOpenRouterWebSearch(
  input: CodexWebSearchInput,
  model: string,
  options: ProviderWebSearchOptions,
): Promise<CodexWebSearchOutput> {
  const allowedDomains = normalizeDomains(input.allowed_domains)
  const blockedDomains = normalizeDomains(input.blocked_domains)
  const parameters = {
    max_results: 5,
    ...(allowedDomains.length ? { allowed_domains: allowedDomains } : {}),
    ...(blockedDomains.length ? { excluded_domains: blockedDomains } : {}),
  }
  return runResponsesJsonWebSearch({
    providerId: 'openrouter',
    input,
    options,
    url: OPENROUTER_RESPONSES_URL,
    body: {
      model,
      input: buildSearchPrompt(input),
      tools: [{ type: 'openrouter:web_search', parameters }],
      stream: false,
    },
  })
}

async function runResponsesJsonWebSearch(args: {
  providerId: string
  input: CodexWebSearchInput
  options: ProviderWebSearchOptions
  url: string
  body: unknown
}): Promise<CodexWebSearchOutput> {
  const now = args.options.now ?? performance.now.bind(performance)
  const start = now()
  const response = await (args.options.fetchImpl ?? fetch)(args.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolveProviderApiKey(args.providerId, args.options)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args.body),
    signal: args.options.signal,
  })
  const json = await parseJsonResponse(response, getProviderName(args.providerId))
  return outputFromProviderJson(args.input, json, (now() - start) / 1000)
}

async function runPerplexitySearch(
  input: CodexWebSearchInput,
  options: ProviderWebSearchOptions,
): Promise<CodexWebSearchOutput> {
  const now = options.now ?? performance.now.bind(performance)
  const start = now()
  const body = {
    query: input.query,
    max_results: 10,
    max_tokens_per_page: 1024,
    ...(input.allowed_domains?.length
      ? { search_domain_filter: normalizeDomains(input.allowed_domains) }
      : {}),
  }
  const response = await (options.fetchImpl ?? fetch)(PERPLEXITY_SEARCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolveProviderApiKey('perplexity', options)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: options.signal,
  })
  const json = await parseJsonResponse(response, 'Perplexity')
  const results = Array.isArray(json.results) ? json.results : []
  const sources: CodexWebSearchSource[] = []
  const snippets: string[] = []
  for (const result of results) {
    if (!isObject(result)) continue
    const url = stringValue(result.url)
    if (!url) continue
    const title = stringValue(result.title) ?? url
    sources.push({ title, url })
    const snippet = stringValue(result.snippet)
    if (snippet) snippets.push(`- ${title}: ${snippet}`)
  }

  return {
    query: input.query,
    durationSeconds: (now() - start) / 1000,
    results: [
      snippets.length
        ? `Perplexity returned ${sources.length} ranked web results:\n${snippets.join('\n')}`
        : `Perplexity returned ${sources.length} ranked web results.`,
      ...(sources.length
        ? [{ tool_use_id: 'web_search', content: sources }]
        : ['No web search results were returned.']),
    ],
  }
}

async function runGoogleGroundedWebSearch(
  input: CodexWebSearchInput,
  model: string,
  options: ProviderWebSearchOptions,
): Promise<CodexWebSearchOutput> {
  const now = options.now ?? performance.now.bind(performance)
  const start = now()
  const response = await (options.fetchImpl ?? fetch)(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': resolveProviderApiKey('google', options),
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildSearchPrompt(input) }] }],
        tools: [{ google_search: {} }],
      }),
      signal: options.signal,
    },
  )
  const json = await parseJsonResponse(response, 'Google')
  return outputFromProviderJson(input, json, (now() - start) / 1000)
}

async function runAnthropicWebSearch(
  input: CodexWebSearchInput,
  model: string,
  options: ProviderWebSearchOptions,
): Promise<CodexWebSearchOutput> {
  const now = options.now ?? performance.now.bind(performance)
  const start = now()
  const tool = {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: 5,
    ...(input.allowed_domains?.length
      ? { allowed_domains: normalizeDomains(input.allowed_domains) }
      : {}),
    ...(input.blocked_domains?.length
      ? { blocked_domains: normalizeDomains(input.blocked_domains) }
      : {}),
  }
  const response = await (options.fetchImpl ?? fetch)(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': resolveProviderApiKey('anthropic', options),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildSearchPrompt(input) }],
      tools: [tool],
    }),
    signal: options.signal,
  })
  const json = await parseJsonResponse(response, 'Anthropic')
  return outputFromProviderJson(input, json, (now() - start) / 1000)
}

async function parseJsonResponse(
  response: Response,
  providerName: string,
): Promise<JsonRecord> {
  const text = await response.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { error: text }
  }
  if (!response.ok) {
    throw new Error(
      `${providerName} web search failed: HTTP ${response.status} ${summarizeError(json)}`,
    )
  }
  return isObject(json) ? json : {}
}

function outputFromProviderJson(
  input: CodexWebSearchInput,
  json: JsonRecord,
  durationSeconds: number,
): CodexWebSearchOutput {
  const text = extractResponseText(json)
  const sources = extractSources(json)
  const results: CodexWebSearchOutput['results'] = []
  if (text) results.push(text)
  if (sources.length) {
    results.push({ tool_use_id: 'web_search', content: sources })
  }
  if (!results.length) {
    results.push('No web search results were returned.')
  }
  return {
    query: input.query,
    results,
    durationSeconds,
  }
}

function extractResponseText(json: JsonRecord): string {
  const direct = stringValue(json.output_text) ?? stringValue(json.text)
  if (direct) return direct.trim()

  const parts: string[] = []
  collectText(json.output, parts)
  collectText(json.content, parts)
  collectText(json.candidates, parts)
  collectText(json.choices, parts)
  return unique(parts.map(part => part.trim()).filter(Boolean)).join('\n\n')
}

function collectText(value: unknown, parts: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, parts)
    return
  }
  if (!isObject(value)) return
  const type = stringValue(value.type)
  const text = stringValue(value.text) ?? stringValue(value.output_text)
  if (text && type !== 'web_search_call' && type !== 'web_search_tool_result') {
    parts.push(text)
  }
  collectText(value.message, parts)
  collectText(value.content, parts)
  collectText(value.parts, parts)
}

function extractSources(json: JsonRecord): CodexWebSearchSource[] {
  const out = new Map<string, CodexWebSearchSource>()
  collectSources(json, out)
  return Array.from(out.values())
}

function collectSources(value: unknown, out: Map<string, CodexWebSearchSource>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSources(item, out)
    return
  }
  if (typeof value === 'string') {
    addSource(out, value, value)
    return
  }
  if (!isObject(value)) return

  const web = isObject(value.web) ? value.web : undefined
  const url = stringValue(value.url) ?? stringValue(value.uri) ?? stringValue(web?.uri)
  if (url) {
    addSource(
      out,
      url,
      stringValue(value.title) ?? stringValue(web?.title) ?? url,
    )
  }

  for (const key of [
    'citations',
    'annotations',
    'sources',
    'output',
    'content',
    'parts',
    'candidates',
    'groundingMetadata',
    'groundingChunks',
  ]) {
    collectSources(value[key], out)
  }
}

function addSource(
  out: Map<string, CodexWebSearchSource>,
  url: string,
  title: string,
): void {
  if (!url || out.has(url)) return
  out.set(url, { title, url })
}

function resolveProviderApiKey(
  providerId: string,
  options: ProviderWebSearchOptions,
): string {
  const env = options.env ?? process.env
  const config = options.providerConfig ??
    (options.env ? undefined : getSettings_DEPRECATED()?.provider)
  const provider = getProviderInfo(providerId)
  const configured = config?.[providerId]?.options?.apiKey
  const configuredToken = config?.[providerId]?.options?.token
  const key = stringValue(configured) ??
    stringValue(configuredToken) ??
    firstEnvValue(provider?.env ?? [], env)
  if (!key) {
    const envHint = provider?.env.length ? provider.env.join(' or ') : 'an API key'
    throw new Error(
      `${getProviderName(providerId)} web search requires ${envHint} or provider.${providerId}.options.apiKey.`,
    )
  }
  return key
}

function firstEnvValue(
  names: readonly string[],
  env: Record<string, string | undefined>,
): string | undefined {
  for (const name of names) {
    const value = env[name]
    if (value) return value
  }
  return undefined
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
    'Return concise findings and preserve source URLs.',
  ].filter(Boolean)
  return `Search the web for: ${input.query}.\n${hints.join('\n')}`
}

function normalizeDomains(domains: string[] | undefined): string[] {
  return (domains ?? [])
    .map(domain => domain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
    .filter(Boolean)
}

function getProviderName(providerId: string): string {
  return getProviderInfo(providerId)?.name ?? providerId
}

function summarizeError(json: unknown): string {
  if (!isObject(json)) return String(json)
  const error = json.error
  if (typeof error === 'string') return error
  if (isObject(error)) {
    return stringValue(error.message) ?? JSON.stringify(error)
  }
  return JSON.stringify(json)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isObject(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

export const PROVIDER_NATIVE_WEB_SEARCH_DOCS = {
  openai: 'https://platform.openai.com/docs/guides/tools-web-search?api-mode=responses',
  xai: 'https://docs.x.ai/developers/tools/web-search',
  openrouter:
    'https://openrouter.ai/docs/guides/features/server-tools/web-search',
  google: 'https://ai.google.dev/gemini-api/docs/grounding/',
  perplexity: 'https://docs.perplexity.ai/docs/search/quickstart',
  anthropic:
    'https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool',
} as const
