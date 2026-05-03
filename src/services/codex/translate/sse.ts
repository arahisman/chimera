export interface SseEvent {
  event?: string
  data: string
}

export function encodeSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

const BOUNDARY = /\r\n\r\n|\n\n|\r\r/

export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let match: RegExpExecArray | null
      while ((match = BOUNDARY.exec(buffer)) !== null) {
        const raw = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        const event = parseEventBlock(raw)
        if (event) yield event
      }
    }
    if (buffer.trim()) {
      const event = parseEventBlock(buffer)
      if (event) yield event
    }
  } finally {
    reader.releaseLock()
  }
}

function parseEventBlock(raw: string): SseEvent | undefined {
  let event: string | undefined
  const dataLines: string[] = []
  for (const line of raw.split(/\r\n|\n|\r/)) {
    if (!line || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'event') event = value
    else if (field === 'data') dataLines.push(value)
  }
  if (!dataLines.length && !event) return undefined
  return { event, data: dataLines.join('\n') }
}
