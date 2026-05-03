import { describe, expect, test } from 'bun:test'
import {
  ChimeraIdeMessageSchema,
  createIdeEvent,
  createIdeRequest,
  createIdeResponse,
  isIdeRequest,
} from './protocol.js'

describe('Chimera IDE protocol', () => {
  test('parses initialize requests', () => {
    const message = createIdeRequest(1, 'initialize', {
      protocolVersion: 'chimera.ide.v1',
      minProtocolVersion: 'chimera.ide.v1',
      extensionVersion: '0.1.0',
      editor: { kind: 'vscode', name: 'Visual Studio Code' },
      workspaceFolders: [{ uri: 'file:///tmp/project', name: 'project' }],
      capabilities: { context: true, diff: true, permissions: true },
    })
    const parsed = ChimeraIdeMessageSchema.parse(message)
    expect(isIdeRequest(parsed)).toBe(true)
    expect(parsed.method).toBe('initialize')
  })

  test('parses status events', () => {
    const event = createIdeEvent('status', {
      state: 'thinking',
      label: 'Weaving',
      sessionId: 'session-1',
    })
    const parsed = ChimeraIdeMessageSchema.parse(event)
    expect(parsed.method).toBe('event/status')
  })

  test('parses response envelopes', () => {
    const response = createIdeResponse(1, {
      protocolVersion: 'chimera.ide.v1',
      cliVersion: '0.1.0-alpha.0',
      account: { loggedIn: false },
      models: [],
      permissionMode: 'default',
      capabilities: { context: true, diff: true, permissions: true },
    })
    const parsed = ChimeraIdeMessageSchema.parse(response)
    expect(parsed.id).toBe(1)
    expect(parsed.result.account.loggedIn).toBe(false)
  })
})
