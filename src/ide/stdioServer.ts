import {
  CHIMERA_IDE_PROTOCOL_VERSION,
  ChimeraIdeMessageSchema,
  IdeInitializeParamsSchema,
  IdeRequestMethodSchema,
  createIdeError,
  createIdeResponse,
  type IdeInitializeParams,
  type IdeInitializeResult,
} from './protocol.js'
import { JsonRpcLineDecoder, encodeJsonRpcLine } from './jsonRpc.js'

export type ChimeraIdeRuntimeContext = {
  cliVersion: string
}

export type ChimeraIdeRuntime = {
  initialize(
    params: IdeInitializeParams,
    context: ChimeraIdeRuntimeContext,
  ): Promise<IdeInitializeResult>
}

export type IdeStdioServerOptions = {
  input: NodeJS.ReadableStream
  output: NodeJS.WritableStream
  runtime: ChimeraIdeRuntime
  cliVersion: string
}

export async function runDefaultIdeStdioServer(): Promise<void> {
  await runIdeStdioServer({
    input: process.stdin,
    output: process.stdout,
    runtime: createMinimalIdeRuntime(),
    cliVersion: process.env.CHIMERA_VERSION ?? '0.0.0-local',
  })
}

export function runIdeStdioServer(
  options: IdeStdioServerOptions,
): Promise<void> {
  const decoder = new JsonRpcLineDecoder()

  return new Promise((resolve, reject) => {
    options.input.setEncoding?.('utf8')
    options.input.on('data', chunk => {
      try {
        for (const message of decoder.push(String(chunk))) {
          void dispatchMessage(options, message)
        }
      } catch (error) {
        writeMessage(
          options.output,
          createIdeError(null, -32700, 'Parse error', errorMessage(error)),
        )
      }
    })
    options.input.on('end', () => {
      try {
        for (const message of decoder.flush()) {
          void dispatchMessage(options, message)
        }
        resolve()
      } catch (error) {
        writeMessage(
          options.output,
          createIdeError(null, -32700, 'Parse error', errorMessage(error)),
        )
        resolve()
      }
    })
    options.input.on('error', reject)
  })
}

async function dispatchMessage(
  options: IdeStdioServerOptions,
  rawMessage: Record<string, unknown>,
): Promise<void> {
  const maybeId =
    typeof rawMessage.id === 'string' || typeof rawMessage.id === 'number'
      ? rawMessage.id
      : null

  if (
    rawMessage.jsonrpc === '2.0' &&
    typeof rawMessage.method === 'string' &&
    'id' in rawMessage &&
    !IdeRequestMethodSchema.safeParse(rawMessage.method).success
  ) {
    writeMessage(
      options.output,
      createIdeError(
        maybeId,
        -32601,
        `Method not found: ${rawMessage.method}`,
      ),
    )
    return
  }

  const parsed = ChimeraIdeMessageSchema.safeParse(rawMessage)
  if (!parsed.success) {
    writeMessage(
      options.output,
      createIdeError(maybeId, -32600, 'Invalid request', parsed.error.message),
    )
    return
  }

  const message = parsed.data
  if (!('id' in message) || !('method' in message)) {
    return
  }

  try {
    switch (message.method) {
      case 'initialize': {
        const params = IdeInitializeParamsSchema.parse(message.params)
        const result = await options.runtime.initialize(params, {
          cliVersion: options.cliVersion,
        })
        writeMessage(options.output, createIdeResponse(message.id, result))
        return
      }
      default:
        writeMessage(
          options.output,
          createIdeError(message.id, -32601, `Method not found: ${message.method}`),
        )
    }
  } catch (error) {
    writeMessage(
      options.output,
      createIdeError(message.id, -32603, 'Internal error', errorMessage(error)),
    )
  }
}

function createMinimalIdeRuntime(): ChimeraIdeRuntime {
  return {
    async initialize(
      params,
      context,
    ): Promise<IdeInitializeResult> {
      return {
        protocolVersion: CHIMERA_IDE_PROTOCOL_VERSION,
        cliVersion: context.cliVersion,
        account: { loggedIn: false },
        models: [],
        permissionMode: 'default',
        capabilities: {
          context: Boolean(params.capabilities.context),
          diff: Boolean(params.capabilities.diff),
          permissions: Boolean(params.capabilities.permissions),
        },
      }
    },
  }
}

function writeMessage(
  output: NodeJS.WritableStream,
  message: Record<string, unknown>,
): void {
  output.write(encodeJsonRpcLine(message))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
