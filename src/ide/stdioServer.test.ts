import { describe, expect, test } from 'bun:test'
import { PassThrough, Writable } from 'stream'
import {
  CHIMERA_IDE_PROTOCOL_VERSION,
  createIdeRequest,
  type IdeInitializeParams,
  type IdeInitializeResult,
} from './protocol.js'
import {
  type ChimeraIdeRuntime,
  runIdeStdioServer,
} from './stdioServer.js'

describe('IDE stdio server', () => {
  test('responds to initialize requests', async () => {
    const { input, output, readOutput } = createHarness()
    const runtime = createFakeRuntime()
    const server = runIdeStdioServer({
      input,
      output,
      runtime,
      cliVersion: '0.1.0-test',
    })

    input.end(
      `${JSON.stringify(
        createIdeRequest(1, 'initialize', {
          protocolVersion: CHIMERA_IDE_PROTOCOL_VERSION,
          minProtocolVersion: CHIMERA_IDE_PROTOCOL_VERSION,
          extensionVersion: '0.1.0',
          editor: { kind: 'vscode', name: 'VS Code' },
          workspaceFolders: [],
          capabilities: { context: true, diff: true, permissions: true },
        }),
      )}\n`,
    )
    await server

    const response = JSON.parse(readOutput())
    expect(response.id).toBe(1)
    expect(response.result.protocolVersion).toBe(CHIMERA_IDE_PROTOCOL_VERSION)
    expect(response.result.cliVersion).toBe('0.1.0-test')
    expect(response.result.account.loggedIn).toBe(false)
  })

  test('returns method-not-found for unknown requests', async () => {
    const { input, output, readOutput } = createHarness()
    const server = runIdeStdioServer({
      input,
      output,
      runtime: createFakeRuntime(),
      cliVersion: '0.1.0-test',
    })

    input.end('{"jsonrpc":"2.0","id":2,"method":"missing.method","params":{}}\n')
    await server

    const response = JSON.parse(readOutput())
    expect(response.id).toBe(2)
    expect(response.error.code).toBe(-32601)
    expect(response.error.message).toContain('Method not found')
  })

  test('returns parse errors for malformed JSON', async () => {
    const { input, output, readOutput } = createHarness()
    const server = runIdeStdioServer({
      input,
      output,
      runtime: createFakeRuntime(),
      cliVersion: '0.1.0-test',
    })

    input.end('{broken}\n')
    await server

    const response = JSON.parse(readOutput())
    expect(response.id).toBe(null)
    expect(response.error.code).toBe(-32700)
    expect(response.error.message).toContain('Parse error')
  })
})

function createHarness(): {
  input: PassThrough
  output: Writable
  readOutput: () => string
} {
  const input = new PassThrough()
  const chunks: string[] = []
  const output = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk))
      callback()
    },
  })
  return {
    input,
    output,
    readOutput: () => chunks.join('').trim(),
  }
}

function createFakeRuntime(): ChimeraIdeRuntime {
  return {
    async initialize(
      params: IdeInitializeParams,
      context: { cliVersion: string },
    ): Promise<IdeInitializeResult> {
      return {
        protocolVersion: params.protocolVersion,
        cliVersion: context.cliVersion,
        account: { loggedIn: false },
        models: [],
        permissionMode: 'default',
        capabilities: { context: true, diff: true, permissions: true },
      }
    },
  }
}
