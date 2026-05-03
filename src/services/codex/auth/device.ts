import { setTimeout as sleep } from 'timers/promises'
import { CODEX_CLIENT_ID, CODEX_OAUTH_ISSUER } from './constants.js'
import type { CodexTokenResponse } from './jwt.js'

const POLL_SAFETY_MARGIN_MS = 3000

export interface CodexDeviceLoginInfo {
  device_auth_id: string
  user_code: string
  interval: string | number
}

export async function startCodexDeviceLogin(): Promise<CodexDeviceLoginInfo> {
  const response = await fetch(
    `${CODEX_OAUTH_ISSUER}/api/accounts/deviceauth/usercode`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CODEX_CLIENT_ID }),
    },
  )
  if (!response.ok) throw new Error(`Codex device init failed: ${response.status}`)
  return (await response.json()) as CodexDeviceLoginInfo
}

export async function pollCodexDeviceLogin(
  info: CodexDeviceLoginInfo,
  options: { signal?: AbortSignal } = {},
): Promise<CodexTokenResponse> {
  const intervalMs = Math.max(Number(info.interval) || 5, 1) * 1000

  while (!options.signal?.aborted) {
    const response = await fetch(
      `${CODEX_OAUTH_ISSUER}/api/accounts/deviceauth/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_auth_id: info.device_auth_id,
          user_code: info.user_code,
        }),
        signal: options.signal,
      },
    )
    if (response.ok) {
      const body = (await response.json()) as {
        authorization_code: string
        code_verifier: string
      }
      return exchangeDeviceAuthorizationCode(body, options.signal)
    }
    if (response.status !== 403 && response.status !== 404) {
      throw new Error(`Codex device poll failed: ${response.status}`)
    }
    await sleep(intervalMs + POLL_SAFETY_MARGIN_MS, undefined, {
      signal: options.signal,
    })
  }

  throw new Error('Codex device login aborted')
}

async function exchangeDeviceAuthorizationCode(
  body: { authorization_code: string; code_verifier: string },
  signal?: AbortSignal,
): Promise<CodexTokenResponse> {
  const response = await fetch(`${CODEX_OAUTH_ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: body.authorization_code,
      redirect_uri: `${CODEX_OAUTH_ISSUER}/deviceauth/callback`,
      client_id: CODEX_CLIENT_ID,
      code_verifier: body.code_verifier,
    }).toString(),
    signal,
  })
  if (!response.ok) {
    throw new Error(`Codex device token exchange failed: ${response.status}`)
  }
  return (await response.json()) as CodexTokenResponse
}

export async function runCodexDeviceLogin(
  onUserCode?: (info: {
    verification_uri: string
    user_code: string
  }) => Promise<void> | void,
): Promise<CodexTokenResponse> {
  const info = await startCodexDeviceLogin()
  await onUserCode?.({
    verification_uri: `${CODEX_OAUTH_ISSUER}/codex/device`,
    user_code: info.user_code,
  })
  return pollCodexDeviceLogin(info)
}

