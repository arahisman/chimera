export interface CodexIdTokenClaims {
  chatgpt_account_id?: string
  organizations?: Array<{ id: string }>
  email?: string
  'https://api.openai.com/auth'?: { chatgpt_account_id?: string }
  'https://api.openai.com/auth.chatgpt_account_id'?: string
}

export interface CodexTokenResponse {
  id_token?: string
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

export function parseJwtClaims(token: string): CodexIdTokenClaims | undefined {
  const parts = token.split('.')
  if (parts.length !== 3) return undefined
  try {
    return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString())
  } catch {
    return undefined
  }
}

export function extractAccountIdFromClaims(
  claims: CodexIdTokenClaims,
): string | undefined {
  return (
    claims.chatgpt_account_id ||
    claims['https://api.openai.com/auth']?.chatgpt_account_id ||
    claims['https://api.openai.com/auth.chatgpt_account_id'] ||
    claims.organizations?.[0]?.id
  )
}

export function extractEmailFromClaims(
  claims: CodexIdTokenClaims,
): string | undefined {
  return claims.email
}

export function extractAccountId(
  tokens: Pick<CodexTokenResponse, 'id_token' | 'access_token'>,
): string | undefined {
  if (tokens.id_token) {
    const claims = parseJwtClaims(tokens.id_token)
    const accountId = claims && extractAccountIdFromClaims(claims)
    if (accountId) return accountId
  }
  const claims = parseJwtClaims(tokens.access_token)
  return claims ? extractAccountIdFromClaims(claims) : undefined
}

export function extractEmail(
  tokens: Pick<CodexTokenResponse, 'id_token' | 'access_token'>,
): string | undefined {
  if (tokens.id_token) {
    const claims = parseJwtClaims(tokens.id_token)
    const email = claims && extractEmailFromClaims(claims)
    if (email) return email
  }
  const claims = parseJwtClaims(tokens.access_token)
  return claims ? extractEmailFromClaims(claims) : undefined
}

