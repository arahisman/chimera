import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { mapUsageToAnthropic, reduceUpstream } from './reducer.js'
import type { CodexLogger } from './types.js'

export async function* codexToAnthropicEvents(
  upstream: ReadableStream<Uint8Array>,
  opts: { messageId: string; model: string; log: CodexLogger },
): AsyncGenerator<BetaRawMessageStreamEvent> {
  yield {
    type: 'message_start',
    message: {
      id: opts.messageId,
      type: 'message',
      role: 'assistant',
      model: opts.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  } as BetaRawMessageStreamEvent

  for await (const event of reduceUpstream(upstream, opts.log)) {
    switch (event.kind) {
      case 'text-start':
        yield {
          type: 'content_block_start',
          index: event.index,
          content_block: { type: 'text', text: '' },
        } as BetaRawMessageStreamEvent
        break
      case 'text-delta':
        yield {
          type: 'content_block_delta',
          index: event.index,
          delta: { type: 'text_delta', text: event.text },
        } as BetaRawMessageStreamEvent
        break
      case 'text-stop':
        yield {
          type: 'content_block_stop',
          index: event.index,
        } as BetaRawMessageStreamEvent
        break
      case 'tool-start':
        yield {
          type: 'content_block_start',
          index: event.index,
          content_block: {
            type: 'tool_use',
            id: event.id,
            name: event.name,
            input: {},
          },
        } as BetaRawMessageStreamEvent
        break
      case 'tool-delta':
        yield {
          type: 'content_block_delta',
          index: event.index,
          delta: {
            type: 'input_json_delta',
            partial_json: event.partialJson,
          },
        } as BetaRawMessageStreamEvent
        break
      case 'tool-stop':
        yield {
          type: 'content_block_stop',
          index: event.index,
        } as BetaRawMessageStreamEvent
        break
      case 'finish':
        yield {
          type: 'message_delta',
          delta: {
            stop_reason: event.stopReason,
            stop_sequence: null,
          },
          usage: mapUsageToAnthropic(event.usage),
        } as BetaRawMessageStreamEvent
        yield { type: 'message_stop' } as BetaRawMessageStreamEvent
        break
    }
  }
}
