import {
  mapUsageToAnthropic,
  reduceUpstream,
  UpstreamStreamError,
  type CodexUsage,
  type StopReason,
} from './reducer.js'
import { encodeSseEvent } from './sse.js'
import type { CodexLogger } from './types.js'

export function translateStream(
  upstream: ReadableStream<Uint8Array>,
  opts: {
    messageId: string
    model: string
    log: CodexLogger
    onFinish?: (finish: {
      stopReason: StopReason
      usage?: CodexUsage
    }) => void
  },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(encodeSseEvent(event, data)))
      }
      const activeTools = new Map<number, { id: string; name: string }>()
      let messageStarted = false
      const ensureMessageStart = () => {
        if (messageStarted) return
        messageStarted = true
        emit('message_start', {
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
        })
        emit('ping', { type: 'ping' })
      }

      try {
        for await (const event of reduceUpstream(upstream, opts.log)) {
          switch (event.kind) {
            case 'text-start':
              ensureMessageStart()
              emit('content_block_start', {
                type: 'content_block_start',
                index: event.index,
                content_block: { type: 'text', text: '' },
              })
              break
            case 'text-delta':
              emit('content_block_delta', {
                type: 'content_block_delta',
                index: event.index,
                delta: { type: 'text_delta', text: event.text },
              })
              break
            case 'text-stop':
              emit('content_block_stop', {
                type: 'content_block_stop',
                index: event.index,
              })
              break
            case 'tool-start':
              activeTools.set(event.index, { id: event.id, name: event.name })
              ensureMessageStart()
              emit('content_block_start', {
                type: 'content_block_start',
                index: event.index,
                content_block: {
                  type: 'tool_use',
                  id: event.id,
                  name: event.name,
                  input: {},
                },
              })
              break
            case 'tool-delta':
              emit('content_block_delta', {
                type: 'content_block_delta',
                index: event.index,
                delta: {
                  type: 'input_json_delta',
                  partial_json: event.partialJson,
                },
              })
              break
            case 'tool-stop':
              activeTools.delete(event.index)
              emit('content_block_stop', {
                type: 'content_block_stop',
                index: event.index,
              })
              break
            case 'finish':
              ensureMessageStart()
              opts.onFinish?.({
                stopReason: event.stopReason,
                usage: event.usage,
              })
              emit('message_delta', {
                type: 'message_delta',
                delta: {
                  stop_reason: event.stopReason,
                  stop_sequence: null,
                },
                usage: mapUsageToAnthropic(event.usage),
              })
              emit('message_stop', { type: 'message_stop' })
              break
          }
        }
      } catch (error) {
        const activeToolNames = Array.from(
          activeTools.values(),
          tool => tool.name,
        )
        if (error instanceof UpstreamStreamError) {
          opts.log.warn('upstream stream error', {
            kind: error.kind,
            message: error.message,
            activeToolNames,
          })
          ensureMessageStart()
          emit('error', {
            type: 'error',
            error: {
              type:
                error.kind === 'rate_limit'
                  ? 'rate_limit_error'
                  : 'api_error',
              message: error.message,
            },
          })
        } else {
          opts.log.error('stream translation error', {
            error: String(error),
            activeToolNames,
          })
          ensureMessageStart()
          emit('error', {
            type: 'error',
            error: { type: 'api_error', message: String(error) },
          })
        }
      } finally {
        controller.close()
      }
    },
  })
}
