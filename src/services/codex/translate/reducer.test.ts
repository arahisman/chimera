import { describe, expect, test } from 'bun:test'
import { reduceCodexEvents } from './reducer.js'

describe('codex stream reducer', () => {
  test('emits text and tool events in order', () => {
    const events = Array.from(
      reduceCodexEvents([
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'message', id: 'msg_1' },
        },
        { type: 'response.output_text.delta', output_index: 0, delta: 'hello' },
        {
          type: 'response.output_item.done',
          output_index: 0,
          item: { type: 'message', id: 'msg_1' },
        },
        {
          type: 'response.output_item.added',
          output_index: 1,
          item: { type: 'function_call', call_id: 'call_1', name: 'Read' },
        },
        {
          type: 'response.function_call_arguments.delta',
          output_index: 1,
          delta: '{"file_path":"',
        },
        {
          type: 'response.function_call_arguments.delta',
          output_index: 1,
          delta: 'README.md"}',
        },
        {
          type: 'response.output_item.done',
          output_index: 1,
          item: { type: 'function_call', call_id: 'call_1', name: 'Read' },
        },
        {
          type: 'response.completed',
          response: { usage: { input_tokens: 1, output_tokens: 1 } },
        },
      ]),
    )

    expect(events.map(event => event.kind)).toEqual([
      'text-start',
      'text-delta',
      'text-stop',
      'tool-start',
      'tool-delta',
      'tool-stop',
      'finish',
    ])
    expect(events.at(-1)).toMatchObject({
      kind: 'finish',
      stopReason: 'tool_use',
    })
  })

  test('maps rate limit events to upstream errors', () => {
    expect(() =>
      Array.from(
        reduceCodexEvents([
          {
            type: 'codex.rate_limits',
            rate_limits: {
              limit_reached: true,
              primary: { reset_after_seconds: 30 },
            },
          },
        ]),
      ),
    ).toThrow(/rate limit/)
  })

  test('uses function_call_arguments.done when deltas are absent', () => {
    const events = Array.from(
      reduceCodexEvents([
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'function_call', call_id: 'call_ls', name: 'LS' },
        },
        {
          type: 'response.function_call_arguments.done',
          output_index: 0,
          arguments: '{"path":"/tmp/project"}',
        },
        {
          type: 'response.output_item.done',
          output_index: 0,
          item: { type: 'function_call', call_id: 'call_ls', name: 'LS' },
        },
      ]),
    )

    expect(events).toContainEqual({
      kind: 'tool-delta',
      index: 0,
      partialJson: '{"path":"/tmp/project"}',
    })
    expect(events.at(-1)).toMatchObject({
      kind: 'finish',
      stopReason: 'tool_use',
    })
  })

  test('buffers Read arguments and removes empty pages before tool execution', () => {
    const events = Array.from(
      reduceCodexEvents([
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'function_call', call_id: 'call_read', name: 'Read' },
        },
        {
          type: 'response.function_call_arguments.delta',
          output_index: 0,
          delta: '{"file_path":"README.md","pages":""}',
        },
        {
          type: 'response.output_item.done',
          output_index: 0,
          item: { type: 'function_call', call_id: 'call_read', name: 'Read' },
        },
      ]),
    )

    expect(events.filter(event => event.kind === 'tool-delta')).toEqual([
      {
        kind: 'tool-delta',
        index: 0,
        partialJson: '{"file_path":"README.md"}',
      },
    ])
  })

  test('maps incomplete responses to max_tokens stop reason', () => {
    const events = Array.from(
      reduceCodexEvents([
        {
          type: 'response.incomplete',
          response: {
            status: 'incomplete',
            incomplete_details: { reason: 'max_output_tokens' },
            usage: { input_tokens: 3, output_tokens: 5 },
          },
        },
      ]),
    )

    expect(events.at(-1)).toEqual({
      kind: 'finish',
      stopReason: 'max_tokens',
      usage: { input_tokens: 3, output_tokens: 5 },
    })
  })
})
