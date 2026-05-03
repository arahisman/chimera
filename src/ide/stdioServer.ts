import {
  ChimeraIdeMessageSchema,
  IdeContextUpdateParamsSchema,
  IdeInitializeParamsSchema,
  IdeSendPromptParamsSchema,
  IdeRequestMethodSchema,
  IdeSetModelParamsSchema,
  IdeSetPermissionModeParamsSchema,
  createIdeError,
  createIdeResponse,
} from './protocol.js'
import { JsonRpcLineDecoder, encodeJsonRpcLine } from './jsonRpc.js'
import {
  IdeRuntimeError,
  createDefaultIdeRuntime,
  type ChimeraIdeRuntime,
} from './runtime.js'

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
    runtime: createDefaultIdeRuntime({
      cliVersion: process.env.CHIMERA_VERSION ?? '0.0.0-local',
    }),
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
      case 'sendPrompt': {
        const params = IdeSendPromptParamsSchema.parse(message.params)
        const result = await options.runtime.sendPrompt(params)
        writeMessage(options.output, createIdeResponse(message.id, result))
        return
      }
      case 'interrupt': {
        const result = await options.runtime.interrupt()
        writeMessage(options.output, createIdeResponse(message.id, result))
        return
      }
      case 'setModel': {
        const params = IdeSetModelParamsSchema.parse(message.params)
        const result = await options.runtime.setModel(params)
        writeMessage(options.output, createIdeResponse(message.id, result))
        return
      }
      case 'setPermissionMode': {
        const params = IdeSetPermissionModeParamsSchema.parse(message.params)
        const result = await options.runtime.setPermissionMode(params)
        writeMessage(options.output, createIdeResponse(message.id, result))
        return
      }
      case 'context.update': {
        const params = IdeContextUpdateParamsSchema.parse(message.params)
        const result = await options.runtime.updateContext(params)
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
      error instanceof IdeRuntimeError
        ? createIdeError(message.id, error.code, error.message, error.data)
        : createIdeError(message.id, -32603, 'Internal error', errorMessage(error)),
    )
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
