#!/usr/bin/env bun
import { writeFile } from 'fs/promises'
import WebSocket from 'ws'
import { getFreshCodexTokens } from '../src/services/codex/auth/manager.ts'
import { loadCodexTokens } from '../src/services/codex/auth/token-store.ts'

const TRACE_PATH = '/tmp/chimera-live-voice.json'
const DEFAULT_TIMEOUT_MS = 12_000
const REST_TRANSCRIPTION_URL =
  process.env.CHIMERA_OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT ??
  'https://api.openai.com/v1/audio/transcriptions'
const REALTIME_URL =
  process.env.CHIMERA_OPENAI_REALTIME_ENDPOINT ??
  'wss://api.openai.com/v1/realtime?intent=transcription'
const TRANSCRIBE_MODEL =
  process.env.CHIMERA_OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-transcribe'

if (process.env.CHIMERA_LIVE !== '1') {
  console.error(
    'Refusing to run live Codex voice probe without CHIMERA_LIVE=1.',
  )
  console.error(
    'Run `CHIMERA_LIVE=1 bun scripts/live-codex-voice.mjs` after `chimera login`.',
  )
  process.exit(2)
}

const timeoutMs = Number(
  process.env.CHIMERA_LIVE_VOICE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
)

const trace = {
  generated_at: new Date().toISOString(),
  docs_checked: [
    'https://developers.openai.com/api/docs/guides/realtime-transcription',
    'https://developers.openai.com/api/docs/guides/realtime-websocket',
    'https://platform.openai.com/docs/api-reference/audio/createTranscription',
  ],
  timeout_ms: Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS,
  auth_source: 'chimera ChatGPT OAuth',
  authenticated: false,
  endpoints: {
    rest_transcription: sanitizeUrl(REST_TRANSCRIPTION_URL),
    realtime: sanitizeUrl(REALTIME_URL),
  },
  model: TRANSCRIBE_MODEL,
  results: {
    rest_transcription: null,
    realtime_websocket: null,
  },
  error_type: null,
}

if (!(await loadCodexTokens())) {
  trace.error_type = 'not_authenticated'
  await writeTrace()
  console.error('Not authenticated. Run `chimera login` before live voice probe.')
  process.exit(2)
}

let tokens
try {
  tokens = await getFreshCodexTokens()
  trace.authenticated = true
} catch (error) {
  trace.error_type = error?.name ?? 'auth_error'
  await writeTrace()
  throw error
}

trace.results.rest_transcription = await probeRestTranscription(tokens)
trace.results.realtime_websocket = await probeRealtimeWebSocket(tokens)
await writeTrace()
console.log(`wrote sanitized live Codex voice trace to ${TRACE_PATH}`)

async function probeRestTranscription(tokens) {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error('probe_timeout')),
    trace.timeout_ms,
  )
  const result = {
    classification: 'unknown',
    http_status: null,
    error_type: null,
    response_header_names: [],
  }

  try {
    const form = new FormData()
    form.set('model', TRANSCRIBE_MODEL)
    form.set('file', new Blob([createSilentWav()], { type: 'audio/wav' }), 'silence.wav')

    const response = await fetch(REST_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: authHeaders(tokens),
      body: form,
      signal: controller.signal,
    })
    result.http_status = response.status
    result.response_header_names = headerNames(response.headers)
    result.classification = classifyHttpStatus(response.status)
    if (!response.ok) {
      result.error_type = await sanitizedErrorType(response)
    }
  } catch (error) {
    result.error_type = error?.name ?? 'Error'
    result.classification =
      error?.message === 'probe_timeout' ? 'timeout' : 'unknown'
  } finally {
    clearTimeout(timeout)
  }

  return result
}

function probeRealtimeWebSocket(tokens) {
  return new Promise(resolve => {
    const result = {
      classification: 'unknown',
      http_status: null,
      close_code: null,
      error_type: null,
      server_event_types: [],
      session_updated: false,
      audio_committed: false,
      transcript_delta: false,
      transcript_completed: false,
    }
    const seenEvents = new Set()
    let resolved = false
    const timeout = setTimeout(() => {
      if (result.session_updated) {
        result.classification = 'available'
      } else {
        result.classification = 'timeout'
        result.error_type = 'probe_timeout'
      }
      cleanup()
      resolve(result)
    }, trace.timeout_ms)

    const ws = new WebSocket(REALTIME_URL, {
      headers: authHeaders(tokens),
    })

    ws.on('unexpected-response', (_request, response) => {
      if (resolved) return
      result.http_status = response.statusCode ?? null
      result.classification = classifyHttpStatus(result.http_status)
      result.error_type = 'unexpected_response'
      cleanup()
      resolve(result)
    })

    ws.on('open', () => {
      result.http_status = 101
      result.classification = 'available'
      ws.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            type: 'transcription',
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: 24000 },
                transcription: { model: TRANSCRIBE_MODEL },
                turn_detection: null,
              },
            },
          },
        }),
      )
    })

    ws.on('message', message => {
      try {
        const parsed = JSON.parse(message.toString())
        if (typeof parsed?.type === 'string') seenEvents.add(parsed.type)
        if (parsed?.type === 'error') {
          result.error_type =
            parsed.error?.code ?? parsed.error?.type ?? 'server_error'
          result.classification = 'unknown'
          cleanup()
          resolve(result)
        }
        if (parsed?.type === 'session.updated') {
          result.session_updated = true
          ws.send(
            JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: createSilentPcm().toString('base64'),
            }),
          )
          ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
        }
        if (parsed?.type === 'input_audio_buffer.committed') {
          result.audio_committed = true
          result.classification = 'available'
          cleanup()
          resolve(result)
        }
        if (
          parsed?.type === 'conversation.item.input_audio_transcription.delta'
        ) {
          result.transcript_delta = true
        }
        if (
          parsed?.type ===
          'conversation.item.input_audio_transcription.completed'
        ) {
          result.transcript_completed = true
          result.classification = 'available'
          cleanup()
          resolve(result)
        }
      } catch {
        // Ignore non-JSON frames in the sanitized probe.
      }
    })

    ws.on('close', code => {
      if (resolved) return
      result.close_code = code
      if (result.classification === 'unknown') {
        result.classification = code === 1000 ? 'available' : 'unknown'
      }
      cleanup()
      resolve(result)
    })

    ws.on('error', error => {
      if (resolved) return
      result.error_type = error?.name ?? 'WebSocketError'
      cleanup()
      resolve(result)
    })

    function cleanup() {
      if (resolved) return
      resolved = true
      clearTimeout(timeout)
      result.server_event_types = [...seenEvents].sort()
      try {
        ws.close()
      } catch {
        // Best-effort cleanup only.
      }
    }
  })
}

function authHeaders(tokens) {
  const headers = {
    authorization: `Bearer ${tokens.access_token}`,
    'User-Agent': `chimera/${process.env.CHIMERA_VERSION ?? '0.0.0'}`,
  }
  if (tokens.account_id) headers['ChatGPT-Account-Id'] = tokens.account_id
  return headers
}

function createSilentWav() {
  const sampleRate = 24_000
  const durationSeconds = 0.25
  const samples = Math.floor(sampleRate * durationSeconds)
  const dataSize = samples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

function createSilentPcm() {
  const sampleRate = 24_000
  const durationSeconds = 0.25
  const samples = Math.floor(sampleRate * durationSeconds)
  return Buffer.alloc(samples * 2)
}

function classifyHttpStatus(status) {
  if (status === 200 || status === 101) return 'available'
  if (status === 401 || status === 403) return 'oauth_incompatible'
  if (status === 404) return 'unavailable'
  if (status === 429) return 'rate_limited_or_plan_limited'
  if (status === null) return 'unknown'
  return 'unknown'
}

async function sanitizedErrorType(response) {
  try {
    const body = await response.json()
    return String(body?.error?.type ?? body?.type ?? 'http_error')
  } catch {
    return 'http_error'
  }
}

function sanitizeUrl(value) {
  const parsed = new URL(value)
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
}

function headerNames(headers) {
  const names = []
  headers.forEach((_value, key) => names.push(key.toLowerCase()))
  return [...new Set(names)].sort()
}

async function writeTrace() {
  await writeFile(TRACE_PATH, `${JSON.stringify(trace, null, 2)}\n`, {
    mode: 0o600,
  })
}
