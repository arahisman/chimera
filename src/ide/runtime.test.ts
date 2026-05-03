import { describe, expect, test } from 'bun:test'
import {
  CHIMERA_IDE_PROTOCOL_VERSION,
  type IdeInitializeParams,
} from './protocol.js'
import { IdeRuntimeError, createDefaultIdeRuntime } from './runtime.js'

describe('IDE bridge runtime facade', () => {
  test('initialize returns Chimera model metadata', async () => {
    const runtime = createDefaultIdeRuntime({
      cliVersion: '0.1.0-test',
      discoverExternalModels: false,
    })
    const result = await runtime.initialize(createInitializeParams(), {
      cliVersion: '0.1.0-test',
    })

    expect(result.protocolVersion).toBe(CHIMERA_IDE_PROTOCOL_VERSION)
    expect(result.cliVersion).toBe('0.1.0-test')
    expect(result.models.some(model => model.id === 'gpt-5.5')).toBe(true)
    expect(result.models.find(model => model.id === 'gpt-5.5')).toMatchObject({
      provider: 'codex',
      contextWindow: 1050000,
      current: true,
      available: true,
    })
  })

  test('setModel accepts provider-qualified external model ids', async () => {
    const runtime = createDefaultIdeRuntime({ cliVersion: '0.1.0-test' })

    await expect(
      runtime.setModel({ model: 'openrouter/openai/gpt-5.4' }),
    ).resolves.toEqual({
      model: 'openrouter/openai/gpt-5.4',
    })
  })

  test('sendPrompt runs IDE tasks through the prompt runner', async () => {
    const events: Array<{ name: string; params?: unknown }> = []
    const runtime = createDefaultIdeRuntime({
      cliVersion: '0.1.0-test',
      emitEvent: (name, params) => events.push({ name, params }),
      promptRunner: async function* (input) {
        expect(input.prompt).toBe('Refactor the selected function')
        expect(input.model).toBe('gpt-5.5')
        yield {
          type: 'assistant',
          uuid: 'assistant-1',
          session_id: 'session-1',
          message: {
            content: [{ type: 'text', text: 'I will refactor it.' }],
          },
        }
        yield {
          type: 'result',
          subtype: 'success',
          uuid: 'result-1',
          session_id: 'session-1',
          is_error: false,
          result: 'Done.',
        }
      },
    })

    await expect(
      runtime.sendPrompt({ prompt: 'Refactor the selected function' }),
    ).resolves.toEqual({ accepted: true })
    expect(events.map(event => event.name)).toEqual([
      'status',
      'assistant.message',
      'status',
    ])
    expect(events[0]?.params).toMatchObject({
      state: 'thinking',
    })
    expect(events[1]?.params).toMatchObject({
      text: 'I will refactor it.',
      sessionId: 'session-1',
    })
    expect(events[2]?.params).toMatchObject({
      state: 'done',
      sessionId: 'session-1',
    })
  })

  test('interrupt aborts the active IDE task', async () => {
    const events: Array<{ name: string; params?: unknown }> = []
    let started!: () => void
    const startedPromise = new Promise<void>(resolve => {
      started = resolve
    })
    const runtime = createDefaultIdeRuntime({
      cliVersion: '0.1.0-test',
      emitEvent: (name, params) => events.push({ name, params }),
      promptRunner: async function* (input) {
        started()
        await new Promise<void>(resolve => {
          input.signal.addEventListener('abort', () => resolve(), { once: true })
        })
        throw new Error('aborted')
      },
    })

    const prompt = runtime.sendPrompt({ prompt: 'Run a long task' })
    await startedPromise
    await expect(runtime.interrupt()).resolves.toEqual({ interrupted: true })
    await expect(prompt).resolves.toEqual({ accepted: false })
    expect(events.at(-1)?.params).toMatchObject({
      state: 'idle',
      label: 'Task interrupted.',
    })
  })

  test('setModel rejects unsupported model ids', async () => {
    const runtime = createDefaultIdeRuntime({ cliVersion: '0.1.0-test' })

    await expect(runtime.setModel({ model: 'not-a-real-model' })).rejects.toThrow(
      IdeRuntimeError,
    )
  })

  test('setPermissionMode accepts IDE permission modes', async () => {
    const runtime = createDefaultIdeRuntime({ cliVersion: '0.1.0-test' })

    await expect(runtime.setPermissionMode({ mode: 'dontAsk' })).resolves.toEqual({
      mode: 'dontAsk',
    })
  })

  test('proposeDiff emits native IDE diff events', async () => {
    const events: Array<{ name: string; params?: unknown }> = []
    const runtime = createDefaultIdeRuntime({
      cliVersion: '0.1.0-test',
      emitEvent: (name, params) => events.push({ name, params }),
    })

    await expect(
      runtime.proposeDiff({
        id: 'diff-1',
        toolUseId: 'tool-1',
        filePath: '/tmp/project/src/app.ts',
        originalText: 'old',
        proposedText: 'new',
      }),
    ).resolves.toEqual({ id: 'diff-1' })
    expect(events).toEqual([
      {
        name: 'diff.proposed',
        params: {
          id: 'diff-1',
          toolUseId: 'tool-1',
          filePath: '/tmp/project/src/app.ts',
          originalText: 'old',
          proposedText: 'new',
        },
      },
    ])
  })

  test('requestPermission resolves from an IDE permission response', async () => {
    const events: Array<{ name: string; params?: unknown }> = []
    const runtime = createDefaultIdeRuntime({
      cliVersion: '0.1.0-test',
      emitEvent: (name, params) => events.push({ name, params }),
    })

    const decision = runtime.requestPermission({
      id: 'permission-1',
      toolUseId: 'tool-1',
      toolName: 'Bash',
      displayName: 'Run command',
      inputSummary: 'npm test',
      affectedPaths: ['/tmp/project'],
      risk: 'medium',
      suggestedRules: ['Bash(npm test)'],
    })
    await expect(
      runtime.respondPermission({
        id: 'permission-1',
        decision: 'allowOnce',
        reason: 'Allowed from VS Code',
      }),
    ).resolves.toEqual({ accepted: true, decision: 'allowOnce' })
    await expect(decision).resolves.toEqual({
      id: 'permission-1',
      decision: 'allowOnce',
      reason: 'Allowed from VS Code',
    })
    expect(events[0]).toEqual({
      name: 'permission.request',
      params: {
        id: 'permission-1',
        toolUseId: 'tool-1',
        toolName: 'Bash',
        displayName: 'Run command',
        inputSummary: 'npm test',
        affectedPaths: ['/tmp/project'],
        risk: 'medium',
        suggestedRules: ['Bash(npm test)'],
      },
    })
  })
})

function createInitializeParams(): IdeInitializeParams {
  return {
    protocolVersion: CHIMERA_IDE_PROTOCOL_VERSION,
    minProtocolVersion: CHIMERA_IDE_PROTOCOL_VERSION,
    extensionVersion: '0.1.0',
    editor: { kind: 'vscode', name: 'VS Code' },
    workspaceFolders: [],
    capabilities: { context: true, diff: true, permissions: true },
  }
}
