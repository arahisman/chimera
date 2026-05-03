export type LiveSession = {
  sessionId?: string
  kind?: string
  socketPath?: string
}

export async function sendToUdsSocket(): Promise<void> {
  throw new Error('UDS messaging is outside Chimera local CLI scope.')
}

export async function listAllLiveSessions(): Promise<LiveSession[]> {
  return []
}
