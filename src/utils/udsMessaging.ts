let onEnqueue: ((message: unknown) => void) | null = null
let socketPath: string | null = null

export function getDefaultUdsSocketPath(): string {
  return `/tmp/chimera-${process.pid}.sock`
}

export function getUdsMessagingSocketPath(): string | null {
  return socketPath
}

export async function startUdsMessaging(path = getDefaultUdsSocketPath()): Promise<void> {
  socketPath = path
}

export async function stopUdsMessaging(): Promise<void> {
  socketPath = null
}

export function setOnEnqueue(handler: ((message: unknown) => void) | null): void {
  onEnqueue = handler
}

export function enqueueFromUds(message: unknown): void {
  onEnqueue?.(message)
}

