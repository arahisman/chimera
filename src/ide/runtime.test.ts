import { describe, expect, test } from 'bun:test'
import {
  CHIMERA_IDE_PROTOCOL_VERSION,
  type IdeInitializeParams,
} from './protocol.js'
import { IdeRuntimeError, createDefaultIdeRuntime } from './runtime.js'

describe('IDE bridge runtime facade', () => {
  test('initialize returns Chimera model metadata', async () => {
    const runtime = createDefaultIdeRuntime({ cliVersion: '0.1.0-test' })
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
