export type JsonRpcPrimitive =
  | null
  | boolean
  | number
  | string
  | JsonRpcPrimitive[]
  | { [key: string]: JsonRpcPrimitive }

export type JsonRpcObject = Record<string, unknown>

export function encodeJsonRpcLine(message: JsonRpcObject): string {
  return `${JSON.stringify(message)}\n`
}

export class JsonRpcLineDecoder {
  #buffer = ''

  push(chunk: string | Uint8Array): JsonRpcObject[] {
    this.#buffer += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    return this.#drain(false)
  }

  flush(): JsonRpcObject[] {
    return this.#drain(true)
  }

  #drain(includeTrailingLine: boolean): JsonRpcObject[] {
    const messages: JsonRpcObject[] = []

    while (true) {
      const newlineIndex = this.#buffer.indexOf('\n')
      if (newlineIndex === -1) break

      const line = this.#buffer.slice(0, newlineIndex).trim()
      this.#buffer = this.#buffer.slice(newlineIndex + 1)
      if (line.length > 0) {
        messages.push(parseJsonRpcLine(line))
      }
    }

    if (includeTrailingLine) {
      const line = this.#buffer.trim()
      this.#buffer = ''
      if (line.length > 0) {
        messages.push(parseJsonRpcLine(line))
      }
    }

    return messages
  }
}

function parseJsonRpcLine(line: string): JsonRpcObject {
  try {
    const parsed = JSON.parse(line)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON-RPC line must be an object')
    }
    return parsed as JsonRpcObject
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid JSON-RPC line: ${message}; line=${line}`)
  }
}
