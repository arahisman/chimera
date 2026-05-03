#!/usr/bin/env bun
import { writeFile } from 'fs/promises'
import {
  CODEX_API_ENDPOINT,
  CODEX_OAUTH_ISSUER,
} from '../src/services/codex/auth/constants.ts'
import { postCodexResponses } from '../src/services/codex/client.ts'
import { parseSseStream } from '../src/services/codex/translate/sse.ts'

const TRACE_PATH = '/tmp/chimera-live-contract.json'
const DEFAULT_MODEL = 'gpt-5.4-mini'

if (process.env.CHIMERA_LIVE !== '1') {
  console.error(
    'Refusing to run live Codex contract smoke without CHIMERA_LIVE=1.',
  )
  console.error(
    'Run `CHIMERA_LIVE=1 bun scripts/live-codex-contract.mjs` after `chimera login`.',
  )
  process.exit(2)
}

const originalFetch = globalThis.fetch
const trace = {
  generated_at: new Date().toISOString(),
  request_url_host: null,
  request_path: null,
  request_header_names: [],
  model:
    process.env.CHIMERA_LIVE_MODEL ??
    process.env.CHIMERA_MODEL ??
    DEFAULT_MODEL,
  response_id_prefix: null,
  sse_event_types: [],
  output_item_types: [],
  rate_limit_headers_present: false,
  auth_refresh_attempted: false,
  http_status: null,
  error_type: null,
}

const seenSseTypes = new Set()
const seenOutputTypes = new Set()

globalThis.fetch = (async (url, init) => {
  const requestUrl = String(url)
  if (requestUrl === CODEX_API_ENDPOINT) {
    const parsed = new URL(requestUrl)
    trace.request_url_host = parsed.host
    trace.request_path = parsed.pathname
    trace.request_header_names = headerNames(init?.headers)
    trace.model = requestModel(init?.body) ?? trace.model
  } else if (requestUrl === `${CODEX_OAUTH_ISSUER}/oauth/token`) {
    trace.auth_refresh_attempted = true
  }

  const response = await originalFetch(url, init)
  if (requestUrl === CODEX_API_ENDPOINT) {
    trace.http_status = response.status
    trace.rate_limit_headers_present = hasRateLimitHeaders(response.headers)
  }
  return response
})

try {
  const response = await postCodexResponses(
    {
      model: trace.model,
      instructions:
        'You are Chimera live contract probe. Follow the user request exactly.',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Reply exactly with: codex-contract-ok',
            },
          ],
        },
      ],
      store: false,
      stream: true,
      text: { verbosity: 'low' },
      tool_choice: 'none',
    },
    { sessionId: `live-contract-${Date.now()}` },
  )

  await collectSseTrace(response.body)
  trace.sse_event_types = [...seenSseTypes].sort()
  trace.output_item_types = [...seenOutputTypes].sort()
  await writeTrace()
  console.log(`wrote sanitized live Codex contract trace to ${TRACE_PATH}`)
} catch (error) {
  trace.error_type = error?.name ?? 'Error'
  await writeTrace()
  throw error
} finally {
  globalThis.fetch = originalFetch
}

async function collectSseTrace(body) {
  for await (const event of parseSseStream(body)) {
    if (event.event) seenSseTypes.add(event.event)
    let data
    try {
      data = JSON.parse(event.data)
    } catch {
      continue
    }
    collectJsonTypes(data)
    collectResponseId(data)
  }
}

function collectJsonTypes(value) {
  if (!value || typeof value !== 'object') return
  if (typeof value.type === 'string') seenSseTypes.add(value.type)
  if (typeof value.item?.type === 'string') seenOutputTypes.add(value.item.type)
  if (Array.isArray(value.output)) {
    for (const item of value.output) {
      if (typeof item?.type === 'string') seenOutputTypes.add(item.type)
    }
  }
  if (typeof value.output_item?.type === 'string') {
    seenOutputTypes.add(value.output_item.type)
  }
  if (value.response && typeof value.response === 'object') {
    collectJsonTypes(value.response)
  }
}

function collectResponseId(value) {
  if (trace.response_id_prefix) return
  const id =
    typeof value?.response?.id === 'string'
      ? value.response.id
      : typeof value?.id === 'string'
        ? value.id
        : null
  if (id) trace.response_id_prefix = id.slice(0, 16)
}

function headerNames(headers) {
  if (!headers) return []
  const names = []
  new Headers(headers).forEach((_value, key) => names.push(key.toLowerCase()))
  return [...new Set(names)].sort()
}

function requestModel(body) {
  if (typeof body !== 'string') return null
  try {
    const parsed = JSON.parse(body)
    return typeof parsed.model === 'string' ? parsed.model : null
  } catch {
    return null
  }
}

function hasRateLimitHeaders(headers) {
  for (const key of headers.keys()) {
    const normalized = key.toLowerCase()
    if (normalized.includes('ratelimit') || normalized === 'retry-after') {
      return true
    }
  }
  return false
}

async function writeTrace() {
  await writeFile(TRACE_PATH, `${JSON.stringify(trace, null, 2)}\n`, {
    mode: 0o600,
  })
}
