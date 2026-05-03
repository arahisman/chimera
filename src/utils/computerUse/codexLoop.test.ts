import { describe, expect, test } from 'bun:test'
import {
  buildComputerCallOutputItem,
  buildInitialComputerUseRequest,
  collectComputerUseResponse,
  runCodexComputerUseLoop,
} from './codexLoop.js'

describe('Codex local computer-use loop', () => {
  test('builds an initial Responses computer request for a local browser target', () => {
    const request = buildInitialComputerUseRequest({
      task: 'inspect the page',
      model: 'gpt-5.4',
      displayWidth: 1024,
      displayHeight: 768,
      environment: 'browser',
    })

    expect(request.tools).toEqual([
      {
        type: 'computer',
        display_width: 1024,
        display_height: 768,
        environment: 'browser',
      },
    ])
    expect(request.include).toEqual(['computer_call_output.output.image_url'])
    expect(JSON.stringify(request.input)).toContain('inspect the page')
  })

  test('builds a computer_call_output screenshot item with original detail', () => {
    expect(
      buildComputerCallOutputItem({
        callId: 'call_1',
        screenshotBase64: 'abc123',
      }),
    ).toEqual({
      type: 'computer_call_output',
      call_id: 'call_1',
      output: {
        type: 'computer_screenshot',
        image_url: 'data:image/png;base64,abc123',
        detail: 'original',
      },
    })
  })

  test('collects computer calls and output text from SSE', async () => {
    const response = await collectComputerUseResponse(
      streamFromSse([
        {
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            type: 'computer_call',
            call_id: 'call_1',
            actions: [{ type: 'click', x: 10, y: 20 }],
          },
        },
        {
          type: 'response.output_item.added',
          output_index: 1,
          item: { type: 'message', id: 'msg_1' },
        },
        {
          type: 'response.output_text.delta',
          output_index: 1,
          delta: 'done',
        },
        {
          type: 'response.completed',
          response: { id: 'resp_1' },
        },
      ]),
    )

    expect(response).toEqual({
      responseId: 'resp_1',
      text: 'done',
      computerCalls: [
        {
          callId: 'call_1',
          actions: [{ type: 'click', x: 10, y: 20 }],
        },
      ],
    })
  })

  test('executes actions, captures screenshot, and repeats until final text', async () => {
    const requests: unknown[] = []
    const executed: unknown[][] = []
    const screenshots: string[] = ['first', 'second']
    const result = await runCodexComputerUseLoop({
      task: 'click the button',
      model: 'gpt-5.4',
      maxTurns: 3,
      target: {
        displayWidth: 1024,
        displayHeight: 768,
        environment: 'browser',
        async captureScreenshot() {
          return {
            base64Png: screenshots.shift() ?? 'fallback',
            width: 1024,
            height: 768,
          }
        },
        async executeActions(actions) {
          executed.push(actions)
        },
      },
      safety: {
        approveActions: async actions =>
          actions.every(action => action.type !== 'type'),
      },
      postResponses: async request => {
        requests.push(request)
        const isFollowup = request.input.some(
          item => item.type === 'computer_call_output',
        )
        return {
          status: 200,
          headers: new Headers(),
          body: isFollowup
            ? streamFromSse([
                {
                  type: 'response.output_item.added',
                  output_index: 0,
                  item: { type: 'message', id: 'msg_final' },
                },
                {
                  type: 'response.output_text.delta',
                  output_index: 0,
                  delta: 'finished',
                },
                {
                  type: 'response.completed',
                  response: { id: 'resp_final' },
                },
              ])
            : streamFromSse([
                {
                  type: 'response.output_item.done',
                  output_index: 0,
                  item: {
                    type: 'computer_call',
                    call_id: 'call_1',
                    actions: [{ type: 'click', x: 1, y: 2 }],
                  },
                },
                {
                  type: 'response.completed',
                  response: { id: 'resp_1' },
                },
              ]),
        }
      },
    })

    expect(result.text).toBe('finished')
    expect(result.turns).toBe(2)
    expect(executed).toEqual([[{ type: 'click', x: 1, y: 2 }]])
    expect(JSON.stringify(requests[1])).toContain(
      'data:image/png;base64,first',
    )
  })

  test('rejects risky actions when local approval denies them', async () => {
    await expect(
      runCodexComputerUseLoop({
        task: 'type a password',
        model: 'gpt-5.4',
        target: {
          displayWidth: 1024,
          displayHeight: 768,
          environment: 'browser',
          async captureScreenshot() {
            return { base64Png: 'safe', width: 1024, height: 768 }
          },
          async executeActions() {
            throw new Error('should not execute')
          },
        },
        safety: {
          approveActions: async () => false,
        },
        postResponses: async () => ({
          status: 200,
          headers: new Headers(),
          body: streamFromSse([
            {
              type: 'response.output_item.done',
              output_index: 0,
              item: {
                type: 'computer_call',
                call_id: 'call_1',
                actions: [{ type: 'type', text: 'secret' }],
              },
            },
            {
              type: 'response.completed',
              response: { id: 'resp_1' },
            },
          ]),
        }),
      }),
    ).rejects.toThrow('Computer use action was not approved')
  })
})

function streamFromSse(payloads: unknown[]): ReadableStream<Uint8Array> {
  const body =
    payloads
      .map(payload => {
        const type =
          typeof payload === 'object' && payload && 'type' in payload
            ? String((payload as { type: unknown }).type)
            : 'message'
        return [`event: ${type}`, `data: ${JSON.stringify(payload)}`, ''].join(
          '\n',
        )
      })
      .join('\n') + '\n'
  return new Response(body).body!
}
