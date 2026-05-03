import { readFile } from 'fs/promises'
import type { Command, LocalCommandCall } from '../../types/command.js'
import { getSessionId } from '../../bootstrap/state.js'
import { getSessionInfo } from '../../entrypoints/agentSdkTypes.js'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object'
    ? (value as JsonRecord)
    : undefined
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join(' ')
  }
  const record = asRecord(value)
  if (!record) return ''
  if (typeof record.text === 'string') return record.text
  if ('content' in record) return extractText(record.content)
  if ('message' in record) return extractText(record.message)
  if (typeof record.summary === 'string') return record.summary
  return ''
}

function roleOf(entry: JsonRecord): string {
  const message = asRecord(entry.message)
  const role = message?.role ?? entry.role ?? entry.type
  return typeof role === 'string' ? role : 'unknown'
}

function snippet(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact
}

const call: LocalCommandCall = async args => {
  const sessionId = String(getSessionId())
  const info = await getSessionInfo(sessionId)
  if (!info?.fullPath) {
    return {
      type: 'text',
      value: `No persisted transcript found for current session ${sessionId}.`,
    }
  }

  const raw = await readFile(info.fullPath, 'utf8')
  let total = 0
  let user = 0
  let assistant = 0
  let system = 0
  let lastUser = ''
  let lastAssistant = ''

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    const parsed = JSON.parse(line) as JsonRecord
    const role = roleOf(parsed)
    const text = extractText(parsed)
    total++
    if (role === 'user') {
      user++
      if (text) lastUser = text
    } else if (role === 'assistant') {
      assistant++
      if (text) lastAssistant = text
    } else if (role === 'system' || String(role).startsWith('system')) {
      system++
    }
  }

  const payload = {
    sessionId,
    path: info.fullPath,
    messages: total,
    userMessages: user,
    assistantMessages: assistant,
    systemMessages: system,
    lastUser: snippet(lastUser),
    lastAssistant: snippet(lastAssistant),
  }

  if (args.trim() === '--json') {
    return { type: 'text', value: JSON.stringify(payload, null, 2) }
  }

  return {
    type: 'text',
    value: [
      `Session ${sessionId}`,
      `Transcript: ${info.fullPath}`,
      `Messages: ${total} (${user} user, ${assistant} assistant, ${system} system)`,
      lastUser ? `Last user: ${payload.lastUser}` : undefined,
      lastAssistant ? `Last assistant: ${payload.lastAssistant}` : undefined,
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

const summary = {
  type: 'local',
  name: 'summary',
  description: 'Summarize current local session metadata',
  argumentHint: '[--json]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default summary
