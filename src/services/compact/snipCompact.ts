export const SNIP_NUDGE_TEXT =
  'Use Snip only when explicitly enabled to remove obsolete history from context.'

export type SnipCompactResult<T> = {
  messages: T[]
  tokensFreed: number
  executed: boolean
  boundaryMessage?: T
}

export function isSnipRuntimeEnabled(): boolean {
  return false
}

export function shouldNudgeForSnips(_messages: unknown[]): boolean {
  return false
}

export function isSnipMarkerMessage(_message: unknown): boolean {
  return false
}

export function snipCompactIfNeeded<T>(
  messages: T[],
  _options?: { force?: boolean },
): SnipCompactResult<T> {
  return {
    messages,
    tokensFreed: 0,
    executed: false,
  }
}
