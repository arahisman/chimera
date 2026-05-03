export type ContextCollapseStats = {
  collapsedSpans: number
  collapsedMessages: number
  stagedSpans: number
  health: {
    totalSpawns: number
    totalErrors: number
    totalEmptySpawns: number
    emptySpawnWarningEmitted: boolean
    lastError?: string
  }
}

export type ContextCollapseResult<T> = {
  messages: T[]
}

export type OverflowRecoveryResult<T> = {
  messages: T[]
  committed: number
}

const EMPTY_STATS: ContextCollapseStats = {
  collapsedSpans: 0,
  collapsedMessages: 0,
  stagedSpans: 0,
  health: {
    totalSpawns: 0,
    totalErrors: 0,
    totalEmptySpawns: 0,
    emptySpawnWarningEmitted: false,
  },
}

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function initContextCollapse(): void {
  notify()
}

export function isContextCollapseEnabled(): boolean {
  return false
}

export function getStats(): ContextCollapseStats {
  return EMPTY_STATS
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function applyCollapsesIfNeeded<T>(
  messages: T[],
): Promise<ContextCollapseResult<T>> {
  return { messages }
}

export function recoverFromOverflow<T>(
  messages: T[],
): OverflowRecoveryResult<T> {
  return { messages, committed: 0 }
}

export function isWithheldPromptTooLong(
  _message: unknown,
  _isPromptTooLongMessage?: (message: unknown) => boolean,
  _querySource?: string,
): boolean {
  return false
}

export function resetContextCollapse(): void {
  notify()
}

export { projectView } from './operations.js'
