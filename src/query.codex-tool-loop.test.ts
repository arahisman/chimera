import { describe, expect, test } from 'bun:test'
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { ToolUseBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { readFileSync } from 'fs'
import { join } from 'path'
import { codexToAnthropicEvents } from './services/codex/translate/events.js'
import { translateRequest } from './services/codex/translate/request.js'
import { noopCodexLogger } from './services/codex/translate/types.js'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('codex tool loop compatibility', () => {
  test('roundtrips a Codex function_call through Anthropic tool_use/tool_result shapes', async () => {
    const events = await collectEvents(
      sse([
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'function_call', call_id: 'call_read', name: 'Read' },
        },
        {
          type: 'response.function_call_arguments.delta',
          output_index: 0,
          delta: '{"file_path":"README.md"}',
        },
        {
          type: 'response.output_item.done',
          output_index: 0,
          item: { type: 'function_call', call_id: 'call_read', name: 'Read' },
        },
        {
          type: 'response.completed',
          response: { usage: { input_tokens: 11, output_tokens: 7 } },
        },
      ]),
    )

    const toolStart = events.find(
      (event): event is Extract<
        BetaRawMessageStreamEvent,
        { type: 'content_block_start' }
      > =>
        event.type === 'content_block_start' &&
        event.content_block.type === 'tool_use',
    )
    const toolDelta = events.find(
      (event): event is Extract<
        BetaRawMessageStreamEvent,
        { type: 'content_block_delta' }
      > =>
        event.type === 'content_block_delta' &&
        event.delta.type === 'input_json_delta',
    )

    expect(toolStart?.content_block).toMatchObject({
      type: 'tool_use',
      id: 'call_read',
      name: 'Read',
    })
    expect(toolDelta?.delta).toEqual({
      type: 'input_json_delta',
      partial_json: '{"file_path":"README.md"}',
    })
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'message_delta',
        delta: expect.objectContaining({ stop_reason: 'tool_use' }),
      }),
    )

    const toolUseBlock: ToolUseBlockParam = {
      type: 'tool_use',
      id: 'call_read',
      name: 'Read',
      input: JSON.parse(toolDelta!.delta.partial_json),
    }
    const nextCodexRequest = translateRequest({
      model: 'gpt-5.4',
      messages: [
        {
          role: 'assistant',
          content: [toolUseBlock],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_read',
              content: 'README contents',
            },
          ],
        },
      ],
    })

    expect(nextCodexRequest.input).toContainEqual({
      type: 'function_call',
      call_id: 'call_read',
      name: 'Read',
      arguments: '{"file_path":"README.md"}',
    })
    expect(nextCodexRequest.input).toContainEqual({
      type: 'function_call_output',
      call_id: 'call_read',
      output: 'README contents',
    })
  })

  test('roundtrips permission denials as Codex function_call_output errors', () => {
    const nextCodexRequest = translateRequest({
      model: 'gpt-5.4',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call_bash',
              name: 'Bash',
              input: { command: 'printf denied' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_bash',
              content:
                "Claude requested permissions to use Bash, but you haven't granted it yet.",
              is_error: true,
            },
          ],
        },
      ],
    })

    expect(nextCodexRequest.input).toContainEqual({
      type: 'function_call',
      call_id: 'call_bash',
      name: 'Bash',
      arguments: '{"command":"printf denied"}',
    })
    expect(nextCodexRequest.input).toContainEqual({
      type: 'function_call_output',
      call_id: 'call_bash',
      output:
        "[tool execution error]\nClaude requested permissions to use Bash, but you haven't granted it yet.",
    })
  })

  test('keeps query tool execution and permission gates on the existing Claude harness path', () => {
    const querySource = read('src/query.ts')
    const streamingSource = read('src/services/tools/StreamingToolExecutor.ts')
    const orchestrationSource = read('src/services/tools/toolOrchestration.ts')
    const executionSource = read('src/services/tools/toolExecution.ts')
    const permissionRequestSource = read(
      'src/components/permissions/PermissionRequest.tsx',
    )
    const messageSource = read('src/components/Message.tsx')

    expect(querySource).toContain('const toolUseBlocks: ToolUseBlock[] = []')
    expect(querySource).toContain('message.message.content.filter')
    expect(querySource).toContain("content => content.type === 'tool_use'")
    expect(querySource).toContain('streamingToolExecutor.addTool(toolBlock, message)')
    expect(querySource).toContain(
      'runTools(toolUseBlocks, assistantMessages, canUseTool, toolUseContext)',
    )
    expect(querySource).toContain('normalizeMessagesForAPI')

    expect(streamingSource).toContain("type ToolStatus = 'queued' | 'executing' | 'completed' | 'yielded'")
    expect(streamingSource).toContain('pendingProgress: Message[]')
    expect(streamingSource).toContain('runToolUse(')
    expect(streamingSource).toContain('this.canUseTool')
    expect(orchestrationSource).toContain('runTools(')
    expect(orchestrationSource).toContain('runToolsConcurrently')
    expect(orchestrationSource).toContain('runToolsSerially')

    const permissionIndex = executionSource.indexOf(
      'resolveHookPermissionDecision',
    )
    const callIndex = executionSource.indexOf('const result = await tool.call')
    expect(permissionIndex).toBeGreaterThan(-1)
    expect(callIndex).toBeGreaterThan(-1)
    expect(permissionIndex).toBeLessThan(callIndex)
    expect(executionSource).toContain('canUseTool,')
    expect(executionSource).toContain('permissionDecision.behavior !== \'allow\'')

    for (const component of [
      'BashPermissionRequest',
      'FileEditPermissionRequest',
      'FileWritePermissionRequest',
      'NotebookEditPermissionRequest',
      'WebFetchPermissionRequest',
      'FilesystemPermissionRequest',
      'FallbackPermissionRequest',
    ]) {
      expect(permissionRequestSource).toContain(component)
    }

    for (const visibleState of [
      'grouped_tool_use',
      'tool_result',
      'tool_use',
    ]) {
      expect(messageSource).toContain(`case "${visibleState}"`)
    }
  })
})

async function collectEvents(body: string): Promise<BetaRawMessageStreamEvent[]> {
  const response = new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  })
  const events: BetaRawMessageStreamEvent[] = []
  for await (const event of codexToAnthropicEvents(response.body!, {
    messageId: 'msg_tool_loop',
    model: 'gpt-5.4',
    log: noopCodexLogger,
  })) {
    events.push(event)
  }
  return events
}

function sse(payloads: unknown[]): string {
  return payloads
    .map(payload => {
      const type =
        typeof payload === 'object' && payload && 'type' in payload
          ? String(payload.type)
          : 'message'
      return [`event: ${type}`, `data: ${JSON.stringify(payload)}`, ''].join(
        '\n',
      )
    })
    .join('\n')
}
