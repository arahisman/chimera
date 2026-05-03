import {
  CODEX_CLIENT_ID,
  CODEX_OAUTH_ISSUER,
  CODEX_REFRESH_MARGIN_MS,
} from './constants.js'
import {
  extractAccountId,
  extractEmail,
  type CodexTokenResponse,
} from './jwt.js'
import {
  clearCodexTokens,
  loadCodexTokens,
  saveCodexTokens,
  type CodexTokens,
} from './token-store.js'

function validateCodexTokenResponse(
  tokens: unknown,
  options: { requireRefreshToken: boolean },
): asserts tokens is CodexTokenResponse {
  if (!tokens || typeof tokens !== 'object') {
    throw new Error('Invalid Codex token response: not an object')
  }
  const record = tokens as Record<string, unknown>
  if (typeof record.access_token !== 'string' || !record.access_token) {
    throw new Error('Invalid Codex token response: missing access_token')
  }
  if (
    options.requireRefreshToken &&
    (typeof record.refresh_token !== 'string' || !record.refresh_token)
  ) {
    throw new Error('Invalid Codex token response: missing refresh_token')
  }
  if (
    record.expires_in !== undefined &&
    (typeof record.expires_in !== 'number' ||
      !Number.isFinite(record.expires_in) ||
      record.expires_in <= 0)
  ) {
    throw new Error('Invalid Codex token response: bad expires_in')
  }
}

let cached: CodexTokens | undefined
let inflight: Promise<CodexTokens> | undefined

export async function getFreshCodexTokens(): Promise<CodexTokens> {
  cached ??= await loadCodexTokens()
  if (!cached) {
    throw new Error('Not authenticated. Run /login to sign in with ChatGPT.')
  }
  if (cached.expires_at - CODEX_REFRESH_MARGIN_MS > Date.now()) return cached
  if (inflight) return inflight
  inflight = refreshCodexTokens(cached).finally(() => {
    inflight = undefined
  })
  return inflight
}

export async function forceRefreshCodexTokens(): Promise<CodexTokens> {
  cached ??= await loadCodexTokens()
  if (!cached) throw new Error('Not authenticated')
  if (inflight) return inflight
  inflight = refreshCodexTokens(cached).finally(() => {
    inflight = undefined
  })
  return inflight
}

async function refreshCodexTokens(current: CodexTokens): Promise<CodexTokens> {
  const response = await fetch(`${CODEX_OAUTH_ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: current.refresh_token,
      client_id: CODEX_CLIENT_ID,
    }).toString(),
  })
  if (!response.ok) throw new Error(`Codex token refresh failed: ${response.status}`)
  const tokens = await response.json()
  validateCodexTokenResponse(tokens, { requireRefreshToken: false })
  const next = toStoredTokens(tokens, current.refresh_token, current)
  await saveCodexTokens(next)
  cached = next
  return next
}

function toStoredTokens(
  tokens: CodexTokenResponse,
  fallbackRefreshToken: string,
  previous?: CodexTokens,
): CodexTokens {
  return {
    id_token: tokens.id_token ?? previous?.id_token,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || fallbackRefreshToken,
    expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    account_id: extractAccountId(tokens) || previous?.account_id,
    email: extractEmail(tokens) || previous?.email,
  }
}

export async function persistInitialCodexTokens(
  tokens: CodexTokenResponse,
): Promise<CodexTokens> {
  validateCodexTokenResponse(tokens, { requireRefreshToken: true })
  const stored = toStoredTokens(tokens, tokens.refresh_token!)
  await saveCodexTokens(stored)
  cached = stored
  return stored
}

export async function clearCodexAuth(): Promise<void> {
  cached = undefined
  inflight = undefined
  await clearCodexTokens()
}

export function resetCodexAuthCache(): void {
  cached = undefined
  inflight = undefined
}

