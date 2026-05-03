import {
  mapUsageToAnthropic,
  reduceUpstream,
  type CodexUsage,
} from './reducer.js'
import type { CodexLogger } from './types.js'

export { UpstreamStreamError } from './reducer.js'

export interface AnthropicNonStreamResponse {
  id: string
  type: 'message'
  role: 'assistant'
  model: string
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  >
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | null
  stop_sequence: null
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  }
}

export interface AccumulatedResponse {
  response: AnthropicNonStreamResponse
  rawUsage?: CodexUsage
}

export async function accumulateResponse(
  upstream: ReadableStream<Uint8Array>,
  opts: { messageId: string; model: string; log: CodexLogger },
): Promise<AccumulatedResponse> {
  type Block =
    | { kind: 'text'; text: string }
    | { kind: 'tool'; id: string; name: string; args: string }

  const ordered: number[] = []
  const blocks = new Map<number, Block>()
  let stopReason: AnthropicNonStreamResponse['stop_reason'] = null
  let usage: ReturnType<typeof mapUsageToAnthropic> | undefined
  let rawUsage: CodexUsage | undefined

  for await (const event of reduceUpstream(upstream, opts.log)) {
    switch (event.kind) {
      case 'text-start':
        blocks.set(event.index, { kind: 'text', text: '' })
        ordered.push(event.index)
        break
      case 'text-delta': {
        const block = blocks.get(event.index)
        if (block?.kind === 'text') block.text += event.text
        break
      }
      case 'tool-start':
        blocks.set(event.index, {
          kind: 'tool',
          id: event.id,
          name: event.name,
          args: '',
        })
        ordered.push(event.index)
        break
      case 'tool-delta': {
        const block = blocks.get(event.index)
        if (block?.kind === 'tool') block.args += event.partialJson
        break
      }
      case 'finish':
        stopReason = event.stopReason
        rawUsage = event.usage
        usage = mapUsageToAnthropic(event.usage)
        break
      case 'text-stop':
      case 'tool-stop':
        break
    }
  }

  const content: AnthropicNonStreamResponse['content'] = []
  for (const index of ordered) {
    const block = blocks.get(index)
    if (!block) continue
    if (block.kind === 'text') {
      if (block.text) content.push({ type: 'text', text: block.text })
      continue
    }
    let input: unknown = {}
    try {
      input = block.args ? JSON.parse(block.args) : {}
    } catch {
      input = { _raw: block.args }
    }
    content.push({
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input,
    })
  }

  return {
    rawUsage,
    response: {
      id: opts.messageId,
      type: 'message',
      role: 'assistant',
      model: opts.model,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: usage ?? {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  }
}
