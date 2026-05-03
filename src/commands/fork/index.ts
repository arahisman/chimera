import type { Command, LocalCommandCall } from '../../types/command.js'
import { getSessionId } from '../../bootstrap/state.js'
import { forkSession } from '../../entrypoints/agentSdkTypes.js'

function parseForkArgs(args: string): {
  title?: string
  upToMessageId?: string
} {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const out: { title?: string; upToMessageId?: string } = {}
  const titleParts: string[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if ((part === '--message' || part === '--up-to') && parts[i + 1]) {
      out.upToMessageId = parts[++i]
      continue
    }
    titleParts.push(part)
  }

  if (titleParts.length) out.title = titleParts.join(' ')
  return out
}

const call: LocalCommandCall = async args => {
  const sessionId = String(getSessionId())
  const result = await forkSession(sessionId, parseForkArgs(args))
  const path =
    typeof result === 'object' && 'fullPath' in result
      ? String(result.fullPath)
      : undefined

  return {
    type: 'text',
    value: path
      ? `Forked current session.\n\nSession: ${result.sessionId}\nPath: ${path}`
      : `Forked current session.\n\nSession: ${result.sessionId}`,
  }
}

const fork = {
  type: 'local',
  name: 'fork',
  description: 'Fork the current local session',
  argumentHint: '[title] [--message <message-id>]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default fork
