import { describe, expect, test } from 'bun:test'
import {
  connectCodexVoiceTranscription,
  hasCodexVoiceTranscriptionAuth,
  pcm16MonoToWav,
  resamplePcm16Mono,
  transcribePcmWithCodexOAuth,
} from './realtimeTranscription.js'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  readyState = 0
  sent: unknown[] = []
  url: string
  options: unknown
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  constructor(url: string, options?: unknown) {
    this.url = url
    this.options = options
    FakeWebSocket.instances.push(this)
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    const listeners = this.listeners.get(event) ?? []
    listeners.push(listener)
    this.listeners.set(event, listeners)
  }

  send(data: string | Buffer): void {
    this.sent.push(JSON.parse(data.toString()))
  }

  close(): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.emit('close', 1000)
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args)
    }
  }

  open(): void {
    this.readyState = 1
    this.emit('open')
  }

  message(payload: unknown): void {
    this.emit('message', JSON.stringify(payload))
  }
}

describe('OpenAI Codex voice transcription adapter', () => {
  test('resamples local 16 kHz PCM to 24 kHz PCM for Realtime', () => {
    const pcm = Buffer.alloc(4)
    pcm.writeInt16LE(0, 0)
    pcm.writeInt16LE(3000, 2)

    const realtimePcm = resamplePcm16Mono(pcm, 16_000, 24_000)

    expect(realtimePcm.length).toBe(6)
    expect(realtimePcm.readInt16LE(0)).toBe(0)
    expect(realtimePcm.readInt16LE(2)).toBe(2000)
    expect(realtimePcm.readInt16LE(4)).toBe(3000)
  })

  test('wraps mono 16-bit PCM in a WAV container', () => {
    const pcm = Buffer.from([0x01, 0x00, 0xff, 0x7f])
    const wav = pcm16MonoToWav(pcm, { sampleRate: 16_000, channels: 1 })

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ')
    expect(wav.readUInt16LE(20)).toBe(1)
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.readUInt32LE(24)).toBe(16_000)
    expect(wav.readUInt16LE(34)).toBe(16)
    expect(wav.toString('ascii', 36, 40)).toBe('data')
    expect(wav.readUInt32LE(40)).toBe(pcm.length)
    expect(wav.subarray(44)).toEqual(pcm)
  })

  test('posts WAV audio to OpenAI transcriptions with Codex OAuth headers', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const fetchImpl = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      seen = { url: String(url), init: init ?? {} }
      return Response.json({ text: 'hello world' })
    }) as typeof fetch

    const text = await transcribePcmWithCodexOAuth(
      Buffer.from([0x00, 0x00]),
      {
        endpoint: 'https://api.openai.example/v1/audio/transcriptions',
        model: 'gpt-4o-transcribe',
      },
      {
        fetchImpl,
        getTokens: async () => ({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_at: Date.now() + 60_000,
          account_id: 'account-123',
        }),
      },
    )

    expect(text).toBe('hello world')
    expect(seen?.url).toBe(
      'https://api.openai.example/v1/audio/transcriptions',
    )
    expect(seen?.init.method).toBe('POST')

    const headers = seen?.init.headers as Headers
    expect(headers.get('authorization')).toBe('Bearer access-token')
    expect(headers.get('ChatGPT-Account-Id')).toBe('account-123')

    const body = seen?.init.body as FormData
    expect(body.get('model')).toBe('gpt-4o-transcribe')
    expect(body.get('file')).toBeInstanceOf(Blob)
  })

  test('buffers audio and emits the final transcript on finalize', async () => {
    const transcripts: Array<{ text: string; isFinal: boolean }> = []
    let ready = false
    let closed = false

    const connection = await connectCodexVoiceTranscription(
      {
        onTranscript: (text, isFinal) => transcripts.push({ text, isFinal }),
        onError: error => {
          throw new Error(error)
        },
        onClose: () => {
          closed = true
        },
        onReady: () => {
          ready = true
        },
      },
      undefined,
      {
        transcribePcm: async pcm => {
          expect(pcm).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x04]))
          return ' hello codex '
        },
      },
    )

    expect(connection).not.toBeNull()
    await Promise.resolve()
    expect(ready).toBe(true)

    connection!.send(Buffer.from([0x01, 0x02]))
    connection!.send(Buffer.from([0x03, 0x04]))

    await expect(connection!.finalize()).resolves.toBe(
      'post_closestream_endpoint',
    )
    expect(transcripts).toEqual([{ text: 'hello codex', isFinal: true }])
    expect(closed).toBe(true)
    expect(connection!.isConnected()).toBe(false)
  })

  test('streams Realtime audio and maps delta/completed events', async () => {
    FakeWebSocket.instances.length = 0
    const transcripts: Array<{ text: string; isFinal: boolean }> = []
    let readyConnection:
      | Awaited<ReturnType<typeof connectCodexVoiceTranscription>>
      | undefined
    let closed = false

    const connection = await connectCodexVoiceTranscription(
      {
        onTranscript: (text, isFinal) => transcripts.push({ text, isFinal }),
        onError: error => {
          throw new Error(error)
        },
        onClose: () => {
          closed = true
        },
        onReady: ready => {
          readyConnection = ready
        },
      },
      { language: 'en', keyterms: ['codex', 'realtime'] },
      {
        WebSocketImpl: FakeWebSocket as never,
        getTokens: async () => ({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_at: Date.now() + 60_000,
          account_id: 'account-123',
        }),
      },
    )

    expect(connection).not.toBeNull()
    const ws = FakeWebSocket.instances[0]!
    expect(ws.url).toBe('wss://api.openai.com/v1/realtime?intent=transcription')
    expect((ws.options as { headers: Headers }).headers).toMatchObject({
      authorization: 'Bearer access-token',
      'ChatGPT-Account-Id': 'account-123',
    })

    ws.open()
    expect(ws.sent[0]).toMatchObject({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24_000 },
            transcription: {
              model: 'gpt-4o-transcribe',
              language: 'en',
              prompt: 'codex, realtime',
            },
            turn_detection: null,
          },
        },
      },
    })
    expect(readyConnection).toBeUndefined()

    ws.message({ type: 'session.updated', session: { type: 'transcription' } })
    expect(readyConnection).toBe(connection)

    connection!.send(Buffer.from([0x00, 0x00, 0xb8, 0x0b]))
    expect(ws.sent[1]).toMatchObject({ type: 'input_audio_buffer.append' })
    const appendAudio = Buffer.from(
      (ws.sent[1] as { audio: string }).audio,
      'base64',
    )
    expect(appendAudio.length).toBe(6)

    ws.message({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item_1',
      delta: 'hel',
    })
    ws.message({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item_1',
      delta: 'lo',
    })

    const finalized = connection!.finalize()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(ws.sent[2]).toEqual({ type: 'input_audio_buffer.commit' })

    ws.message({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item_1',
      transcript: 'hello codex',
    })

    await expect(finalized).resolves.toBe('post_closestream_endpoint')
    expect(transcripts).toEqual([
      { text: 'hel', isFinal: false },
      { text: 'hello', isFinal: false },
      { text: 'hello codex', isFinal: true },
    ])
    expect(closed).toBe(true)
  })

  test('checks Codex auth file availability without reading token contents', () => {
    expect(
      hasCodexVoiceTranscriptionAuth({
        authPath: '/tmp/chimera-test/auth.json',
        exists: path => path.endsWith('/auth.json'),
      }),
    ).toBe(true)
  })
})
