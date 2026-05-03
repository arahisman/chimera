import {
  CODEX_API_ENDPOINT,
  CODEX_ORIGINATOR,
} from './auth/constants.js'
import {
  forceRefreshCodexTokens,
  getFreshCodexTokens,
} from './auth/manager.js'
import type { CodexTokens } from './auth/token-store.js'
import { CodexHTTPError } from './errors.js'
import type { ResponsesRequest } from './translate/request.js'

export interface CodexResponse {
  body: ReadableStream<Uint8Array>
  headers: Headers
  status: number
}

export async function postCodexResponses(
  body: ResponsesRequest,
  options: { sessionId?: string; signal?: AbortSignal } = {},
): Promise<CodexResponse> {
  let tokens = await getFreshCodexTokens()
  let response = await doFetch(tokens, body, options)

  if (response.status === 401) {
    tokens = await forceRefreshCodexTokens()
    response = await doFetch(tokens, body, options)
  }

  if (!response.ok) throw await CodexHTTPError.fromResponse(response)
  if (!response.body) {
    throw new CodexHTTPError(500, 'Codex upstream returned no body')
  }
  return {
    body: response.body,
    headers: response.headers,
    status: response.status,
  }
}

function doFetch(
  tokens: CodexTokens,
  body: ResponsesRequest,
  options: { sessionId?: string; signal?: AbortSignal },
): Promise<Response> {
  const headers = new Headers({
    authorization: `Bearer ${tokens.access_token}`,
    'content-type': 'application/json',
    accept: 'text/event-stream',
    originator: CODEX_ORIGINATOR,
    'openai-beta': 'responses=experimental',
    'User-Agent': `chimera/${process.env.CHIMERA_VERSION ?? process.env.CODEX_CODE_VERSION ?? '0.0.0'}`,
  })

  if (tokens.account_id) headers.set('ChatGPT-Account-Id', tokens.account_id)
  if (options.sessionId) {
    headers.set('session_id', options.sessionId)
    headers.set('x-client-request-id', options.sessionId)
    headers.set('x-codex-window-id', `${options.sessionId}:0`)
  }

  return fetch(CODEX_API_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  })
}
