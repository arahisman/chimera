import { describe, expect, test } from 'bun:test'
import {
  extractAccountId,
  extractAccountIdFromClaims,
  extractEmail,
  parseJwtClaims,
} from './jwt.js'

function jwt(claims: unknown): string {
  return [
    Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url'),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    'signature',
  ].join('.')
}

describe('codex jwt helpers', () => {
  test('parses base64url JWT claims', () => {
    expect(parseJwtClaims(jwt({ chatgpt_account_id: 'acct_1' }))).toEqual({
      chatgpt_account_id: 'acct_1',
    })
  })

  test('returns undefined for malformed tokens', () => {
    expect(parseJwtClaims('not-a-jwt')).toBeUndefined()
  })

  test('extracts account id from known claim variants', () => {
    expect(
      extractAccountIdFromClaims({
        'https://api.openai.com/auth.chatgpt_account_id': 'acct_url',
      }),
    ).toBe('acct_url')
    expect(
      extractAccountIdFromClaims({ organizations: [{ id: 'org_1' }] }),
    ).toBe('org_1')
  })

  test('prefers id token account and email claims', () => {
    const idToken = jwt({
      chatgpt_account_id: 'acct_id',
      email: 'dev@example.com',
    })
    const accessToken = jwt({ chatgpt_account_id: 'acct_access' })

    expect(extractAccountId({ id_token: idToken, access_token: accessToken })).toBe(
      'acct_id',
    )
    expect(extractEmail({ id_token: idToken, access_token: accessToken })).toBe(
      'dev@example.com',
    )
  })
})

