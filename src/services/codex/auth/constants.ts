const DEFAULT_CODEX_OAUTH_ISSUER = 'https://auth.openai.com'
const DEFAULT_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const DEFAULT_CODEX_OAUTH_PORT = 1455

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function parsePort(value: string | undefined): number {
  if (!value) return DEFAULT_CODEX_OAUTH_PORT
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return DEFAULT_CODEX_OAUTH_PORT
  }
  return parsed
}

export const CODEX_OAUTH_ISSUER = withoutTrailingSlash(
  optionalEnv('CHIMERA_OAUTH_ISSUER') ??
    optionalEnv('CODEX_CODE_OAUTH_ISSUER') ??
    DEFAULT_CODEX_OAUTH_ISSUER,
)
export const CODEX_CLIENT_ID =
  optionalEnv('CHIMERA_OAUTH_CLIENT_ID') ??
  optionalEnv('CHIMERA_CLIENT_ID') ??
  optionalEnv('CODEX_CODE_OAUTH_CLIENT_ID') ??
  optionalEnv('CODEX_CODE_CLIENT_ID') ??
  DEFAULT_CODEX_CLIENT_ID
export const CODEX_API_ENDPOINT =
  process.env.CHIMERA_API_ENDPOINT ??
  process.env.CODEX_CODE_API_ENDPOINT ??
  'https://chatgpt.com/backend-api/codex/responses'
export const CODEX_OAUTH_PORT = parsePort(
  optionalEnv('CHIMERA_OAUTH_PORT') ?? optionalEnv('CODEX_CODE_OAUTH_PORT'),
)
export const CODEX_OAUTH_REDIRECT_URI =
  optionalEnv('CHIMERA_OAUTH_REDIRECT_URI') ??
  optionalEnv('CODEX_CODE_OAUTH_REDIRECT_URI') ??
  `http://localhost:${CODEX_OAUTH_PORT}/auth/callback`
export const CODEX_ORIGINATOR = 'chimera'
export const CODEX_REFRESH_MARGIN_MS = 5 * 60 * 1000
