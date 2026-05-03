import { parseSseStream } from './sse.js'
import { noopCodexLogger, type CodexLogger } from './types.js'

export class UpstreamStreamError extends Error {
  constructor(
    public kind: 'rate_limit' | 'failed',
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'UpstreamStreamError'
  }
}

export interface CodexUsage {
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
  output_tokens_details?: { reasoning_tokens?: number }
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens'

export type ReducerEvent =
  | { kind: 'text-start'; index: number }
  | { kind: 'text-delta'; index: number; text: string }
  | { kind: 'text-stop'; index: number }
  | { kind: 'tool-start'; index: number; id: string; name: string }
  | { kind: 'tool-delta'; index: number; partialJson: string }
  | { kind: 'tool-stop'; index: number }
  | { kind: 'finish'; stopReason: StopReason; usage: CodexUsage | undefined }

type BlockState =
  | { kind: 'text'; index: number; textAccum: string }
  | {
      kind: 'tool'
      index: number
      callId: string
      name: string
      argsAccum: string
      bufferUntilDone: boolean
      emittedArgs: boolean
    }

class CodexEventReducer {
  private blocksByOutputIndex = new Map<number, BlockState>()
  private itemIdToOutputIndex = new Map<string, number>()
  private anthropicIndex = 0
  private sawToolUse = false
  private finalUsage: CodexUsage | undefined
  private incomplete = false

  constructor(private readonly log: CodexLogger) {}

  push(payload: any): ReducerEvent[] {
    const out: ReducerEvent[] = []
    const type: string = payload.type || ''

    if (type === 'codex.rate_limits') {
      if (payload.rate_limits?.limit_reached) {
        throw new UpstreamStreamError(
          'rate_limit',
          'rate limit reached',
          payload.rate_limits?.primary?.reset_after_seconds,
        )
      }
      return out
    }
    if (type === 'response.failed' || type === 'response.error' || type === 'error') {
      const message =
        payload?.response?.error?.message ||
        payload?.error?.message ||
        'Upstream error'
      throw new UpstreamStreamError('failed', message)
    }

    if (type === 'response.output_item.added') {
      this.handleOutputItemAdded(payload, out)
    } else if (type === 'response.output_text.delta') {
      this.handleTextDelta(payload, out)
    } else if (type === 'response.function_call_arguments.delta') {
      this.handleToolDelta(payload, out)
    } else if (type === 'response.function_call_arguments.done') {
      this.handleToolArgsDone(payload)
    } else if (type === 'response.output_item.done') {
      this.handleOutputItemDone(payload, out)
    } else if (type === 'response.completed' || type === 'response.incomplete') {
      this.finalUsage = payload.response?.usage
      const reason = payload.response?.incomplete_details?.reason
      if (
        type === 'response.incomplete' ||
        reason === 'max_output_tokens' ||
        payload.response?.status === 'incomplete'
      ) {
        this.incomplete = true
      }
    }
    return out
  }

  finish(): ReducerEvent {
    const stopReason: StopReason = this.incomplete
      ? 'max_tokens'
      : this.sawToolUse
        ? 'tool_use'
        : 'end_turn'
    return { kind: 'finish', stopReason, usage: this.finalUsage }
  }

  private handleOutputItemAdded(payload: any, out: ReducerEvent[]): void {
    const item = payload.item
    const outputIndex: number = payload.output_index
    if (!item || item.type === 'reasoning') return
    if (item.type === 'message') {
      const index = this.anthropicIndex++
      this.blocksByOutputIndex.set(outputIndex, {
        kind: 'text',
        index,
        textAccum: '',
      })
      if (item.id) this.itemIdToOutputIndex.set(item.id, outputIndex)
      out.push({ kind: 'text-start', index })
      return
    }
    if (item.type === 'function_call') {
      this.sawToolUse = true
      const index = this.anthropicIndex++
      this.blocksByOutputIndex.set(outputIndex, {
        kind: 'tool',
        index,
        callId: item.call_id,
        name: item.name,
        argsAccum: '',
        bufferUntilDone: shouldBufferToolArgs(item.name),
        emittedArgs: false,
      })
      out.push({ kind: 'tool-start', index, id: item.call_id, name: item.name })
    }
  }

  private handleTextDelta(payload: any, out: ReducerEvent[]): void {
    const state = this.resolveTextState(payload)
    if (!state) return
    const delta: string = payload.delta ?? ''
    if (!delta) return
    state.textAccum += delta
    out.push({ kind: 'text-delta', index: state.index, text: delta })
  }

  private handleToolDelta(payload: any, out: ReducerEvent[]): void {
    const state = this.blocksByOutputIndex.get(payload.output_index)
    if (!state || state.kind !== 'tool') return
    const delta: string = payload.delta ?? ''
    if (!delta) return
    state.argsAccum += delta
    if (!state.bufferUntilDone) {
      state.emittedArgs = true
      out.push({ kind: 'tool-delta', index: state.index, partialJson: delta })
    }
  }

  private handleToolArgsDone(payload: any): void {
    const state = this.blocksByOutputIndex.get(payload.output_index)
    if (!state || state.kind !== 'tool') return
    if (typeof payload.arguments === 'string' && !state.argsAccum) {
      state.argsAccum = payload.arguments
    }
  }

  private handleOutputItemDone(payload: any, out: ReducerEvent[]): void {
    const item = payload.item
    const state = this.blocksByOutputIndex.get(payload.output_index)
    if (!state || item?.type === 'reasoning') return
    if (state.kind === 'tool') {
      const finalArgs =
        (typeof item?.arguments === 'string' && item.arguments.length
          ? item.arguments
          : state.argsAccum) || ''
      if (finalArgs.length) {
        state.argsAccum = sanitizeToolArgs(state.name, finalArgs)
        if (state.bufferUntilDone || !state.emittedArgs) {
          state.emittedArgs = true
          out.push({
            kind: 'tool-delta',
            index: state.index,
            partialJson: state.argsAccum,
          })
        }
      }
    }
    if (state.kind === 'text') {
      this.log.debug('text block complete', {
        index: state.index,
        text: state.textAccum,
      })
      out.push({ kind: 'text-stop', index: state.index })
    } else {
      this.log.debug('tool block complete', {
        index: state.index,
        callId: state.callId,
        name: state.name,
        args: state.argsAccum,
      })
      out.push({ kind: 'tool-stop', index: state.index })
    }
    this.blocksByOutputIndex.delete(payload.output_index)
  }

  private resolveTextState(payload: any): Extract<BlockState, { kind: 'text' }> | undefined {
    let state: BlockState | undefined
    if (typeof payload.output_index === 'number') {
      state = this.blocksByOutputIndex.get(payload.output_index)
    }
    if (!state && payload.item_id) {
      const mapped = this.itemIdToOutputIndex.get(payload.item_id)
      if (mapped !== undefined) state = this.blocksByOutputIndex.get(mapped)
    }
    return state?.kind === 'text' ? state : undefined
  }
}

export function* reduceCodexEvents(
  events: Iterable<unknown>,
  log: CodexLogger = noopCodexLogger,
): Generator<ReducerEvent> {
  const reducer = new CodexEventReducer(log)
  for (const event of events) {
    for (const reduced of reducer.push(event)) yield reduced
  }
  yield reducer.finish()
}

export async function* reduceUpstream(
  upstream: ReadableStream<Uint8Array>,
  log: CodexLogger = noopCodexLogger,
): AsyncGenerator<ReducerEvent> {
  const reducer = new CodexEventReducer(log)
  for await (const event of parseSseStream(upstream)) {
    if (!event.data) continue
    let payload: any
    try {
      payload = JSON.parse(event.data)
    } catch (error) {
      log.warn('upstream sse: invalid json', {
        error: String(error),
        preview: event.data.slice(0, 200),
      })
      continue
    }
    if (!payload.type && event.event) payload.type = event.event
    for (const reduced of reducer.push(payload)) yield reduced
  }
  yield reducer.finish()
}

export function mapUsageToAnthropic(u: CodexUsage | undefined): {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
} {
  const cachedTokens = u?.input_tokens_details?.cached_tokens ?? 0
  const totalInputTokens = u?.input_tokens ?? 0
  return {
    input_tokens: Math.max(0, totalInputTokens - cachedTokens),
    output_tokens: u?.output_tokens ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: cachedTokens,
  }
}

function shouldBufferToolArgs(name: string): boolean {
  return name === 'Read'
}

function sanitizeToolArgs(name: string, args: string): string {
  if (name !== 'Read' || !args) return args
  try {
    const parsed = JSON.parse(args)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return args
    if (!('pages' in parsed) || parsed.pages !== '') return args
    const sanitized = { ...parsed }
    delete sanitized.pages
    return JSON.stringify(sanitized)
  } catch {
    return args
  }
}
