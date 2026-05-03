import { existsSync } from 'fs'
import WebSocket from 'ws'
import { getFreshCodexTokens } from '../codex/auth/manager.js'
import { codexAuthPath, type CodexTokens } from '../codex/auth/token-store.js'

export type VoiceTranscriptionCallbacks = {
  onTranscript: (text: string, isFinal: boolean) => void
  onError: (error: string, opts?: { fatal?: boolean }) => void
  onClose: () => void
  onReady: (connection: VoiceTranscriptionConnection) => void
}

export type FinalizeSource =
  | 'post_closestream_endpoint'
  | 'no_data_timeout'
  | 'safety_timeout'
  | 'ws_close'
  | 'ws_already_closed'

export type VoiceTranscriptionConnection = {
  send: (audioChunk: Buffer) => void
  finalize: () => Promise<FinalizeSource>
  close: () => void
  isConnected: () => boolean
}

type HasAuthDeps = {
  authPath?: string
  exists?: (path: string) => boolean
}

type TranscriptionOptions = {
  endpoint?: string
  model?: string
  sampleRate?: number
  channels?: number
}

type TranscriptionDeps = {
  fetchImpl?: typeof fetch
  getTokens?: () => Promise<CodexTokens>
}

type VoiceConnectionDeps = {
  transcribePcm?: (pcm: Buffer) => Promise<string>
  getTokens?: () => Promise<CodexTokens>
  WebSocketImpl?: WebSocketConstructor
}

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions'
const DEFAULT_REALTIME_ENDPOINT =
  'wss://api.openai.com/v1/realtime?intent=transcription'
const DEFAULT_MODEL = 'gpt-4o-transcribe'
const DEFAULT_SAMPLE_RATE = 16_000
const REALTIME_SAMPLE_RATE = 24_000
const DEFAULT_CHANNELS = 1
const PCM_BITS_PER_SAMPLE = 16
const WAV_HEADER_BYTES = 44
const REALTIME_FINALIZE_TIMEOUTS_MS = {
  safety: 5_000,
  noData: 1_500,
}

type WebSocketLike = {
  readyState: number
  send: (data: string | Buffer) => void
  close: () => void
  on: (event: string, listener: (...args: unknown[]) => void) => void
}

type WebSocketConstructor = new (
  url: string,
  options?: { headers?: Record<string, string> },
) => WebSocketLike

export function hasCodexVoiceTranscriptionAuth(
  deps: HasAuthDeps = {},
): boolean {
  return (deps.exists ?? existsSync)(deps.authPath ?? codexAuthPath())
}

export function pcm16MonoToWav(
  pcm: Buffer,
  options: { sampleRate?: number; channels?: number } = {},
): Buffer {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE
  const channels = options.channels ?? DEFAULT_CHANNELS
  const blockAlign = channels * (PCM_BITS_PER_SAMPLE / 8)
  const byteRate = sampleRate * blockAlign
  const wav = Buffer.alloc(WAV_HEADER_BYTES + pcm.length)

  wav.write('RIFF', 0, 'ascii')
  wav.writeUInt32LE(36 + pcm.length, 4)
  wav.write('WAVE', 8, 'ascii')
  wav.write('fmt ', 12, 'ascii')
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(channels, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(byteRate, 28)
  wav.writeUInt16LE(blockAlign, 32)
  wav.writeUInt16LE(PCM_BITS_PER_SAMPLE, 34)
  wav.write('data', 36, 'ascii')
  wav.writeUInt32LE(pcm.length, 40)
  pcm.copy(wav, WAV_HEADER_BYTES)

  return wav
}

export function resamplePcm16Mono(
  pcm: Buffer,
  fromRate = DEFAULT_SAMPLE_RATE,
  toRate = REALTIME_SAMPLE_RATE,
): Buffer {
  if (fromRate === toRate) return Buffer.from(pcm)
  if (fromRate <= 0 || toRate <= 0) {
    throw new Error('PCM sample rates must be positive')
  }

  const inputSamples = Math.floor(pcm.length / 2)
  if (inputSamples === 0) return Buffer.alloc(0)

  const outputSamples = Math.max(1, Math.floor((inputSamples * toRate) / fromRate))
  const output = Buffer.alloc(outputSamples * 2)

  for (let i = 0; i < outputSamples; i++) {
    const sourcePosition = (i * fromRate) / toRate
    const leftIndex = Math.floor(sourcePosition)
    const rightIndex = Math.min(leftIndex + 1, inputSamples - 1)
    const fraction = sourcePosition - leftIndex
    const left = pcm.readInt16LE(leftIndex * 2)
    const right = pcm.readInt16LE(rightIndex * 2)
    const sample = Math.round(left + (right - left) * fraction)
    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2)
  }

  return output
}

export async function transcribePcmWithCodexOAuth(
  pcm: Buffer,
  options: TranscriptionOptions = {},
  deps: TranscriptionDeps = {},
): Promise<string> {
  const getTokens = deps.getTokens ?? getFreshCodexTokens
  const fetchImpl = deps.fetchImpl ?? fetch
  const tokens = await getTokens()
  const endpoint =
    options.endpoint ??
    process.env.CHIMERA_OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT ??
    DEFAULT_ENDPOINT
  const model =
    options.model ??
    process.env.CHIMERA_OPENAI_TRANSCRIBE_MODEL ??
    DEFAULT_MODEL
  const wav = pcm16MonoToWav(pcm, {
    sampleRate: options.sampleRate,
    channels: options.channels,
  })
  const form = new FormData()
  form.set('model', model)
  const wavBytes = new Uint8Array(wav.byteLength)
  wavBytes.set(wav)
  form.set('file', new Blob([wavBytes], { type: 'audio/wav' }), 'audio.wav')

  const headers = new Headers({
    authorization: `Bearer ${tokens.access_token}`,
    'user-agent': 'chimera/local-voice',
  })
  if (tokens.account_id) {
    headers.set('ChatGPT-Account-Id', tokens.account_id)
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: form,
  })

  if (!response.ok) {
    let detail = ''
    try {
      const body = (await response.json()) as {
        error?: { type?: string; message?: string }
        detail?: string
      }
      detail =
        body.error?.message ??
        body.error?.type ??
        body.detail ??
        response.statusText
    } catch {
      detail = await response.text().catch(() => response.statusText)
    }
    throw new Error(
      `OpenAI transcription failed: ${String(response.status)} ${detail}`,
    )
  }

  const body = (await response.json()) as { text?: unknown }
  if (typeof body.text !== 'string') {
    throw new Error('OpenAI transcription response did not include text')
  }
  return body.text
}

export async function connectCodexVoiceTranscription(
  callbacks: VoiceTranscriptionCallbacks,
  options?: { language?: string; keyterms?: string[] },
  deps: VoiceConnectionDeps = {},
): Promise<VoiceTranscriptionConnection | null> {
  if (
    deps.transcribePcm ||
    process.env.CHIMERA_OPENAI_VOICE_REALTIME === '0'
  ) {
    return connectRestVoiceTranscription(callbacks, deps)
  }

  return connectRealtimeVoiceTranscription(callbacks, options, deps)
}

async function connectRestVoiceTranscription(
  callbacks: VoiceTranscriptionCallbacks,
  deps: VoiceConnectionDeps = {},
): Promise<VoiceTranscriptionConnection | null> {
  let connected = true
  let finalizing = false
  let closed = false
  const chunks: Buffer[] = []
  const transcribePcm =
    deps.transcribePcm ??
    ((pcm: Buffer) =>
      transcribePcmWithCodexOAuth(pcm, {
        sampleRate: DEFAULT_SAMPLE_RATE,
        channels: DEFAULT_CHANNELS,
      }))

  const emitCloseOnce = () => {
    if (closed) return
    closed = true
    callbacks.onClose()
  }

  const connection: VoiceTranscriptionConnection = {
    send(audioChunk: Buffer): void {
      if (!connected || finalizing) return
      chunks.push(Buffer.from(audioChunk))
    },
    async finalize(): Promise<FinalizeSource> {
      if (finalizing || !connected) return 'ws_already_closed'
      finalizing = true
      connected = false
      const pcm = Buffer.concat(chunks)
      chunks.length = 0

      if (pcm.length === 0) {
        emitCloseOnce()
        return 'no_data_timeout'
      }

      try {
        const transcript = (await transcribePcm(pcm)).trim()
        if (transcript) {
          callbacks.onTranscript(transcript, true)
        }
        emitCloseOnce()
        return 'post_closestream_endpoint'
      } catch (error) {
        callbacks.onError(
          error instanceof Error
            ? error.message
            : 'OpenAI transcription failed',
          { fatal: false },
        )
        emitCloseOnce()
        return 'safety_timeout'
      }
    },
    close(): void {
      connected = false
      finalizing = true
      chunks.length = 0
      emitCloseOnce()
    },
    isConnected(): boolean {
      return connected
    },
  }

  queueMicrotask(() => {
    if (connected) callbacks.onReady(connection)
  })

  return connection
}

async function connectRealtimeVoiceTranscription(
  callbacks: VoiceTranscriptionCallbacks,
  options: { language?: string; keyterms?: string[] } | undefined,
  deps: VoiceConnectionDeps,
): Promise<VoiceTranscriptionConnection | null> {
  const getTokens = deps.getTokens ?? getFreshCodexTokens
  const WebSocketImpl = deps.WebSocketImpl ?? (WebSocket as WebSocketConstructor)
  const tokens = await getTokens()
  const endpoint =
    process.env.CHIMERA_OPENAI_REALTIME_ENDPOINT ?? DEFAULT_REALTIME_ENDPOINT
  const model =
    process.env.CHIMERA_OPENAI_TRANSCRIBE_MODEL ?? DEFAULT_MODEL
  const headers = realtimeAuthHeaders(tokens)
  const ws = new WebSocketImpl(endpoint, { headers })

  let connected = false
  let configured = false
  let closed = false
  let finalized = false
  let finalizing = false
  let sentAudioBytes = 0
  let resolveFinalize: ((source: FinalizeSource) => void) | null = null
  let cancelNoDataTimer: (() => void) | null = null
  const interimByItemId = new Map<string, string>()

  const emitCloseOnce = () => {
    if (closed) return
    closed = true
    callbacks.onClose()
  }

  const resolveFinalizeOnce = (source: FinalizeSource) => {
    resolveFinalize?.(source)
  }

  const connection: VoiceTranscriptionConnection = {
    send(audioChunk: Buffer): void {
      if (!connected || !configured || finalized) return
      const realtimePcm = resamplePcm16Mono(audioChunk)
      if (realtimePcm.length === 0) return
      sentAudioBytes += realtimePcm.length
      ws.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: realtimePcm.toString('base64'),
        }),
      )
    },
    finalize(): Promise<FinalizeSource> {
      if (finalizing || finalized) return Promise.resolve('ws_already_closed')
      finalizing = true

      if (sentAudioBytes === 0) {
        finalized = true
        closeWebSocket(ws)
        emitCloseOnce()
        return Promise.resolve('no_data_timeout')
      }

      return new Promise<FinalizeSource>(resolve => {
        const safetyTimer = setTimeout(
          () => resolveFinalizeOnce('safety_timeout'),
          REALTIME_FINALIZE_TIMEOUTS_MS.safety,
        )
        const noDataTimer = setTimeout(
          () => resolveFinalizeOnce('no_data_timeout'),
          REALTIME_FINALIZE_TIMEOUTS_MS.noData,
        )
        cancelNoDataTimer = () => {
          clearTimeout(noDataTimer)
          cancelNoDataTimer = null
        }

        resolveFinalize = source => {
          clearTimeout(safetyTimer)
          clearTimeout(noDataTimer)
          resolveFinalize = null
          cancelNoDataTimer = null
          closeWebSocket(ws)
          resolve(source)
        }

        setTimeout(() => {
          finalized = true
          if (isWebSocketOpen(ws)) {
            ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
          } else {
            resolveFinalizeOnce('ws_already_closed')
          }
        }, 0)
      })
    },
    close(): void {
      connected = false
      finalized = true
      closeWebSocket(ws)
      emitCloseOnce()
    },
    isConnected(): boolean {
      return connected && configured && isWebSocketOpen(ws)
    },
  }

  ws.on('open', () => {
    connected = true
    ws.send(JSON.stringify(buildRealtimeSessionUpdate(model, options)))
  })

  ws.on('message', raw => {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(String(raw))
    } catch {
      return
    }

    const type = message.type
    if (type === 'session.updated') {
      configured = true
      callbacks.onReady(connection)
      return
    }

    if (type === 'input_audio_buffer.committed') return

    if (type === 'conversation.item.input_audio_transcription.delta') {
      cancelNoDataTimer?.()
      const itemId =
        typeof message.item_id === 'string' ? message.item_id : 'default'
      const delta = typeof message.delta === 'string' ? message.delta : ''
      if (!delta) return
      const next = (interimByItemId.get(itemId) ?? '') + delta
      interimByItemId.set(itemId, next)
      callbacks.onTranscript(next, false)
      return
    }

    if (type === 'conversation.item.input_audio_transcription.completed') {
      cancelNoDataTimer?.()
      const itemId =
        typeof message.item_id === 'string' ? message.item_id : 'default'
      interimByItemId.delete(itemId)
      const transcript =
        typeof message.transcript === 'string' ? message.transcript.trim() : ''
      if (transcript) {
        callbacks.onTranscript(transcript, true)
      }
      if (finalizing) {
        resolveFinalizeOnce('post_closestream_endpoint')
      }
      return
    }

    if (type === 'error') {
      const detail = extractRealtimeError(message)
      callbacks.onError(detail, { fatal: false })
      if (finalizing) {
        resolveFinalizeOnce('safety_timeout')
      }
    }
  })

  ws.on('close', () => {
    connected = false
    resolveFinalizeOnce(finalizing ? 'ws_close' : 'ws_already_closed')
    emitCloseOnce()
  })

  ws.on('error', error => {
    const message =
      error instanceof Error
        ? error.message
        : 'OpenAI realtime transcription connection failed'
    callbacks.onError(message, { fatal: false })
    if (finalizing) {
      resolveFinalizeOnce('safety_timeout')
    }
  })

  return connection
}

function buildRealtimeSessionUpdate(
  model: string,
  options?: { language?: string; keyterms?: string[] },
): Record<string, unknown> {
  const transcription: Record<string, string> = { model }
  if (options?.language) transcription.language = options.language
  if (options?.keyterms?.length) {
    transcription.prompt = options.keyterms.join(', ')
  }

  return {
    type: 'session.update',
    session: {
      type: 'transcription',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: REALTIME_SAMPLE_RATE },
          transcription,
          turn_detection: null,
        },
      },
    },
  }
}

function realtimeAuthHeaders(tokens: CodexTokens): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${tokens.access_token}`,
    'User-Agent': 'chimera/local-voice',
  }
  if (tokens.account_id) {
    headers['ChatGPT-Account-Id'] = tokens.account_id
  }
  return headers
}

function isWebSocketOpen(ws: WebSocketLike): boolean {
  return ws.readyState === WebSocket.OPEN
}

function closeWebSocket(ws: WebSocketLike): void {
  try {
    ws.close()
  } catch {
    // Best-effort cleanup only.
  }
}

function extractRealtimeError(message: Record<string, unknown>): string {
  const error = message.error
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const detail = record.message ?? record.code ?? record.type
    if (typeof detail === 'string') return detail
  }
  return 'OpenAI realtime transcription failed'
}
