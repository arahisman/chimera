import { spawn } from 'child_process'
import type { IncomingMessage, ServerResponse } from 'http'
import { createServer, type Server } from 'http'
import {
  CODEX_CLIENT_ID,
  CODEX_OAUTH_ISSUER,
  CODEX_OAUTH_PORT,
  CODEX_OAUTH_REDIRECT_URI,
  CODEX_ORIGINATOR,
} from './constants.js'
import type { CodexTokenResponse } from './jwt.js'

export interface PkceCodes {
  verifier: string
  challenge: string
}

export async function generatePKCE(): Promise<PkceCodes> {
  const verifier = base64UrlEncode(
    crypto.getRandomValues(new Uint8Array(32)).buffer,
  )
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )
  return { verifier, challenge: base64UrlEncode(hash) }
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer)
}

export function buildAuthorizeUrl(pkce: PkceCodes, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CODEX_CLIENT_ID,
    redirect_uri: CODEX_OAUTH_REDIRECT_URI,
    scope: 'openid profile email offline_access',
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: CODEX_ORIGINATOR,
  })
  return `${CODEX_OAUTH_ISSUER}/oauth/authorize?${params.toString()}`
}

export async function exchangeCodeForCodexTokens(
  code: string,
  pkce: PkceCodes,
): Promise<CodexTokenResponse> {
  const response = await fetch(`${CODEX_OAUTH_ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CODEX_OAUTH_REDIRECT_URI,
      client_id: CODEX_CLIENT_ID,
      code_verifier: pkce.verifier,
    }).toString(),
  })
  if (!response.ok) {
    throw new Error(
      `Codex token exchange failed: ${response.status} ${await response.text()}`,
    )
  }
  return (await response.json()) as CodexTokenResponse
}

export async function runCodexBrowserLogin(
  onAuthorizeUrl: (url: string) => Promise<void> | void,
): Promise<CodexTokenResponse> {
  const pkce = await generatePKCE()
  const state = generateState()
  const authUrl = buildAuthorizeUrl(pkce, state)
  const callback = await waitForCodexCallback(state, async () => {
    await onAuthorizeUrl(authUrl)
    openSystemBrowser(authUrl)
  })

  try {
    const tokens = await exchangeCodeForCodexTokens(callback.code, pkce)
    callback.respondSuccess()
    return tokens
  } catch (error) {
    callback.respondError(error instanceof Error ? error.message : String(error))
    throw error
  } finally {
    callback.close()
  }
}

type CodexCallback = {
  code: string
  respondSuccess(): void
  respondError(message: string): void
  close(): void
}

async function waitForCodexCallback(
  expectedState: string,
  onReady: () => Promise<void>,
): Promise<CodexCallback> {
  const server = createServer()
  await listen(server)

  return new Promise<CodexCallback>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('Codex OAuth callback timeout'))
    }, 5 * 60 * 1000)
    const fail = (error: Error) => {
      clearTimeout(timeout)
      server.close()
      reject(error)
    }
    server.once('error', fail)

    server.on('request', (req, res) => {
      const parsed = parseCallbackUrl(req)
      if (parsed.pathname !== '/auth/callback') {
        res.writeHead(404)
        res.end('not found')
        return
      }

      const error = parsed.searchParams.get('error')
      if (error) {
        const description =
          parsed.searchParams.get('error_description') ?? error
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(description)
        fail(new Error(description))
        return
      }

      const code = parsed.searchParams.get('code')
      const state = parsed.searchParams.get('state')
      if (!code || state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Invalid Codex OAuth callback')
        fail(new Error('Invalid Codex OAuth callback'))
        return
      }

      clearTimeout(timeout)
      server.off('error', fail)
      resolve({
        code,
        respondSuccess: () => respondHtml(res, 'Authorization Successful'),
        respondError: message =>
          respondHtml(res, 'Authorization Failed', message),
        close: () => server.close(),
      })
    })

    void onReady().catch(error => {
      fail(error instanceof Error ? error : new Error(String(error)))
    })
  })
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(CODEX_OAUTH_PORT, 'localhost', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function parseCallbackUrl(req: IncomingMessage): URL {
  return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
}

function respondHtml(
  res: ServerResponse,
  title: string,
  message = 'You can close this window and return to Chimera.',
): void {
  if (res.headersSent || res.writableEnded) return
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(
    `<!doctype html><html><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(
      message,
    )}</p></body></html>`,
  )
}

function openSystemBrowser(url: string): void {
  const browser = process.env.BROWSER
  const command =
    browser ??
    (process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'rundll32'
        : 'xdg-open')
  const args = browser
    ? [url]
    : process.platform === 'win32'
      ? ['url.dll,FileProtocolHandler', url]
      : [url]

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
  } catch {
    // The callback URL is still printed by the caller; browser opening is best effort.
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
