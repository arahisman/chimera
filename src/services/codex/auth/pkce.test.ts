import { describe, expect, test } from 'bun:test'
import {
  CODEX_CLIENT_ID,
  CODEX_OAUTH_ISSUER,
  CODEX_OAUTH_REDIRECT_URI,
  CODEX_ORIGINATOR,
} from './constants.js'
import { buildAuthorizeUrl, generatePKCE, generateState } from './pkce.js'

describe('codex pkce helpers', () => {
  test('generates verifier and challenge without padding', async () => {
    const pkce = await generatePKCE()

    expect(pkce.verifier.length).toBeGreaterThan(20)
    expect(pkce.challenge.length).toBeGreaterThan(20)
    expect(pkce.verifier).not.toContain('=')
    expect(pkce.challenge).not.toContain('=')
  })

  test('generates state without padding', () => {
    const state = generateState()
    expect(state.length).toBeGreaterThan(20)
    expect(state).not.toContain('=')
  })

  test('builds ChatGPT Codex authorization URL', () => {
    const url = new URL(
      buildAuthorizeUrl({ verifier: 'verifier', challenge: 'challenge' }, 'state'),
    )

    expect(url.origin).toBe(CODEX_OAUTH_ISSUER)
    expect(url.pathname).toBe('/oauth/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe(CODEX_CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe(CODEX_OAUTH_REDIRECT_URI)
    expect(url.searchParams.get('scope')).toBe(
      'openid profile email offline_access',
    )
    expect(url.searchParams.get('code_challenge')).toBe('challenge')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('id_token_add_organizations')).toBe('true')
    expect(url.searchParams.get('codex_cli_simplified_flow')).toBe('true')
    expect(url.searchParams.get('state')).toBe('state')
    expect(url.searchParams.get('originator')).toBe(CODEX_ORIGINATOR)
  })
})

