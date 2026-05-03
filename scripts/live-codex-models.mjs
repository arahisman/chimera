#!/usr/bin/env bun
import { writeFile } from 'fs/promises'
import { CODEX_API_ENDPOINT } from '../src/services/codex/auth/constants.ts'
import { loadCodexTokens } from '../src/services/codex/auth/token-store.ts'
import { postCodexResponses } from '../src/services/codex/client.ts'
import {
  getCodexModelConfig,
  listCodexModels,
  normalizeCodexModelId,
} from '../src/services/codex/models/registry.ts'
import { CodexHTTPError } from '../src/services/codex/errors.ts'
import { parseSseStream } from '../src/services/codex/translate/sse.ts'

const TRACE_PATH = '/tmp/chimera-live-models.json'
const DEFAULT_TIMEOUT_MS = 20_000

if (process.env.CHIMERA_LIVE !== '1') {
  console.error(
    'Refusing to run live Codex model discovery without CHIMERA_LIVE=1.',
  )
  console.error(
    'Run `CHIMERA_LIVE=1 bun scripts/live-codex-models.mjs` after `chimera login`.',
  )
  process.exit(2)
}

const timeoutMs = Number(
  process.env.CHIMERA_LIVE_MODEL_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
)
const candidates = collectCandidateModels()
const trace = {
  generated_at: new Date().toISOString(),
  request_url_host: new URL(CODEX_API_ENDPOINT).host,
  request_path: new URL(CODEX_API_ENDPOINT).pathname,
  timeout_ms: Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS,
  classifications: [
    'available',
    'unavailable',
    'requires_plan',
    'preview',
    'unknown',
  ],
  candidates,
  results: [],
  error_type: null,
}

if (!(await loadCodexTokens())) {
  trace.error_type = 'not_authenticated'
  await writeTrace()
  console.error('Not authenticated. Run `chimera login` before live discovery.')
  process.exit(2)
}

for (const model of candidates) {
  trace.results.push(await probeModel(model))
}

await writeTrace()
console.log(`wrote sanitized live Codex model discovery trace to ${TRACE_PATH}`)

function collectCandidateModels() {
  const registryModels = listCodexModels({ includeExperimental: true }).map(
    model => model.id,
  )
  const envModels =
    process.env.CHIMERA_LIVE_MODEL_IDS?.split(',')
      .map(model => normalizeCodexModelId(model))
      .filter(Boolean) ?? []
  return [...new Set([...registryModels, ...envModels])]
}

async function probeModel(model) {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error('probe_timeout')),
    trace.timeout_ms,
  )
  const result = {
    model,
    registry_availability:
      getCodexModelConfig(model, { includeExperimental: true })?.availability ??
      'live-discovered',
    classification: 'unknown',
    http_status: null,
    error_type: null,
    retry_after_present: false,
    response_id_prefix: null,
    sse_event_types: [],
    output_item_types: [],
  }

  try {
    const response = await postCodexResponses(
      {
        model,
        instructions:
          'You are Chimera live model probe. Follow the user request exactly.',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Reply exactly with: codex-model-probe-ok',
              },
            ],
          },
        ],
        store: false,
        stream: true,
        text: { verbosity: 'low' },
        tool_choice: 'none',
      },
      {
        sessionId: `live-model-${model}-${Date.now()}`,
        signal: controller.signal,
      },
    )
    result.http_status = response.status
    await collectSse(response.body, result)
    result.classification =
      result.registry_availability === 'preview' ? 'preview' : 'available'
  } catch (error) {
    classifyProbeError(error, result)
  } finally {
    clearTimeout(timeout)
  }

  return result
}

async function collectSse(body, result) {
  const seenEvents = new Set()
  const seenItems = new Set()
  for await (const event of parseSseStream(body)) {
    if (event.event) seenEvents.add(event.event)
    let data
    try {
      data = JSON.parse(event.data)
    } catch {
      continue
    }
    collectJsonTypes(data, seenEvents, seenItems)
    if (!result.response_id_prefix) {
      const id =
        typeof data?.response?.id === 'string'
          ? data.response.id
          : typeof data?.id === 'string'
            ? data.id
            : null
      if (id) result.response_id_prefix = id.slice(0, 16)
    }
  }
  result.sse_event_types = [...seenEvents].sort()
  result.output_item_types = [...seenItems].sort()
}

function collectJsonTypes(value, seenEvents, seenItems) {
  if (!value || typeof value !== 'object') return
  if (typeof value.type === 'string') seenEvents.add(value.type)
  if (typeof value.item?.type === 'string') seenItems.add(value.item.type)
  if (Array.isArray(value.output)) {
    for (const item of value.output) {
      if (typeof item?.type === 'string') seenItems.add(item.type)
    }
  }
  if (typeof value.output_item?.type === 'string') {
    seenItems.add(value.output_item.type)
  }
  if (value.response && typeof value.response === 'object') {
    collectJsonTypes(value.response, seenEvents, seenItems)
  }
}

function classifyProbeError(error, result) {
  if (error instanceof CodexHTTPError) {
    result.http_status = error.status
    result.error_type = error.type
    result.retry_after_present = Boolean(error.retryAfter)
    result.classification = classifyHttpStatus(error.status, error.detail)
    return
  }

  result.error_type = error?.name ?? 'Error'
  result.classification = 'unknown'
}

function classifyHttpStatus(status, detail) {
  const body = String(detail ?? '').toLowerCase()
  if (status === 400 || status === 404 || status === 422) return 'unavailable'
  if (status === 403) return 'requires_plan'
  if (status === 429) return 'requires_plan'
  if (body.includes('not available') || body.includes('unsupported model')) {
    return 'unavailable'
  }
  if (body.includes('plan') || body.includes('entitlement')) {
    return 'requires_plan'
  }
  return 'unknown'
}

async function writeTrace() {
  await writeFile(TRACE_PATH, `${JSON.stringify(trace, null, 2)}\n`, {
    mode: 0o600,
  })
}
