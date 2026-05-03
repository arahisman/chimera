import type { CacheSafeParams } from '../../utils/forkedAgent.js'
import type { CompactionResult } from './compact.js'

type ReactiveCompactFailureReason =
  | 'aborted'
  | 'error'
  | 'exhausted'
  | 'media_unstrippable'
  | 'too_few_groups'

export type ReactiveCompactOutcome =
  | { ok: true; result: CompactionResult }
  | { ok: false; reason: ReactiveCompactFailureReason }

export function isReactiveCompactEnabled(): boolean {
  return false
}

export function isReactiveOnlyMode(): boolean {
  return false
}

export function isWithheldPromptTooLong(_message: unknown): boolean {
  return false
}

export function isWithheldMediaSizeError(_message: unknown): boolean {
  return false
}

export async function tryReactiveCompact(_input: {
  hasAttempted: boolean
  querySource?: string
  aborted: boolean
  messages: unknown[]
  cacheSafeParams: CacheSafeParams
}): Promise<CompactionResult | null> {
  return null
}

export async function reactiveCompactOnPromptTooLong(
  _messages: unknown[],
  _cacheSafeParams: CacheSafeParams,
  input?: { customInstructions?: string; trigger?: 'manual' | 'auto' },
): Promise<ReactiveCompactOutcome> {
  void input
  return { ok: false, reason: 'exhausted' }
}
