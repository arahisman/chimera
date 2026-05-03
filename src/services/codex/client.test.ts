import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { CODEX_API_ENDPOINT, CODEX_OAUTH_ISSUER } from './auth/constants.js'
import { resetCodexAuthCache } from './auth/manager.js'
import { saveCodexTokens } from './auth/token-store.js'
import { postCodexResponses } from './client.js'
import { CodexHTTPError } from './errors.js'
import type { ResponsesRequest } from './translate/request.js'

const ORIGINAL_CONFIG_HOME = process.env.CHIMERA_CONFIG_HOME
const ORIGINAL_FETCH = globalThis.fetch
let tempDir: string

const BODY: ResponsesRequest = {
  model: 'gpt-5.4',
  input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
  store: false,
  stream: true,
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'codex-client-'))
  process.env.CHIMERA_CONFIG_HOME = tempDir
  resetCodexAuthCache()
  await saveCodexTokens({
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: Date.now() + 60 * 60_000,
    account_id: 'account-123',
    email: 'test@example.com',
  })
})

afterEach(async () => {
  globalThis.fetch = ORIGINAL_FETCH
  resetCodexAuthCache()
  if (ORIGINAL_CONFIG_HOME === undefined) delete process.env.CHIMERA_CONFIG_HOME
  else process.env.CHIMERA_CONFIG_HOME = ORIGINAL_CONFIG_HOME
  await rm(tempDir, { recursive: true, force: true })
})

describe('postCodexResponses', () => {
  test('posts to Codex with ChatGPT auth and session headers', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init: init ?? {} }
      return new Response('data: {}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as unknown as typeof fetch

    const response = await postCodexResponses(BODY, { sessionId: 'session-1' })
    expect(response.status).toBe(200)
    expect(seen?.url).toBe(CODEX_API_ENDPOINT)
    expect(seen?.init.method).toBe('POST')
    expect(seen?.init.body).toBe(JSON.stringify(BODY))

    const headers = seen?.init.headers as Headers
    expect(headers.get('authorization')).toBe('Bearer access-token')
    expect(headers.get('ChatGPT-Account-Id')).toBe('account-123')
    expect(headers.get('session_id')).toBe('session-1')
    expect(headers.get('x-client-request-id')).toBe('session-1')
    expect(headers.get('x-codex-window-id')).toBe('session-1:0')
    expect(headers.get('originator')).toBe('chimera')
    expect(headers.get('accept')).toBe('text/event-stream')
  })

  test('maps upstream HTTP failures to CodexHTTPError', async () => {
    globalThis.fetch = (async () =>
      new Response('slow down', {
        status: 429,
        headers: { 'retry-after': '12' },
      })) as unknown as typeof fetch

    await expect(postCodexResponses(BODY)).rejects.toMatchObject({
      name: 'CodexHTTPError',
      status: 429,
      type: 'rate_limit_error',
      retryAfter: '12',
      retryable: true,
    } satisfies Partial<CodexHTTPError>)
  })

  test('refreshes once after a 401 response', async () => {
    const seenAuthorization: string[] = []
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = String(url)
      if (requestUrl === CODEX_API_ENDPOINT) {
        const headers = init?.headers as Headers
        seenAuthorization.push(headers.get('authorization') ?? '')
        return new Response(seenAuthorization.length === 1 ? 'expired' : 'ok', {
          status: seenAuthorization.length === 1 ? 401 : 200,
        })
      }
      if (requestUrl === `${CODEX_OAUTH_ISSUER}/oauth/token`) {
        return Response.json({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        })
      }
      return new Response('unexpected url', { status: 500 })
    }) as unknown as typeof fetch

    const response = await postCodexResponses(BODY)

    expect(response.status).toBe(200)
    expect(seenAuthorization).toEqual([
      'Bearer access-token',
      'Bearer new-access-token',
    ])
  })
})
