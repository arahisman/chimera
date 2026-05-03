import {
  getProviderCatalog,
  getProviderInfo,
  type ExternalProviderInfo,
} from './catalog.js'
import type { SettingsJson } from '../../utils/settings/types.js'

export type CodexAuthProviderChoice = {
  kind: 'codex'
  id: 'codex'
  name: 'ChatGPT / Codex'
  authMethods: readonly ['oauth', 'subscription']
}

export type ExternalAuthProviderChoice = {
  kind: 'external'
  provider: ExternalProviderInfo
}

export type AuthProviderChoice =
  | CodexAuthProviderChoice
  | ExternalAuthProviderChoice

export const CODEX_AUTH_PROVIDER: CodexAuthProviderChoice = {
  kind: 'codex',
  id: 'codex',
  name: 'ChatGPT / Codex',
  authMethods: ['oauth', 'subscription'],
}

export function resolveProviderChoice(
  choice: string,
): ExternalProviderInfo | undefined {
  const trimmed = choice.trim()
  const index = Number(trimmed)
  if (Number.isInteger(index) && index > 0) {
    return getProviderCatalog()[index - 1]
  }
  return getProviderInfo(trimmed)
}

export function resolveAuthProviderChoice(
  choice: string,
): AuthProviderChoice | undefined {
  const trimmed = choice.trim()
  const normalized = trimmed.toLowerCase()
  if (
    normalized === '1' ||
    normalized === 'codex' ||
    normalized === 'chatgpt' ||
    normalized === 'chatgpt/codex' ||
    normalized === 'openai-subscription' ||
    normalized === 'openai-oauth'
  ) {
    return CODEX_AUTH_PROVIDER
  }

  const index = Number(trimmed)
  if (Number.isInteger(index) && index > 1) {
    const provider = getProviderCatalog()[index - 2]
    return provider ? { kind: 'external', provider } : undefined
  }

  const provider = resolveProviderChoice(trimmed)
  return provider ? { kind: 'external', provider } : undefined
}

export function buildProviderApiKeySettings(
  currentSettings: SettingsJson,
  providerId: string,
  apiKey: string,
): Pick<SettingsJson, 'provider'> {
  const existingProvider = currentSettings.provider?.[providerId] ?? {}
  return {
    provider: {
      ...currentSettings.provider,
      [providerId]: {
        ...existingProvider,
        options: {
          ...(existingProvider.options ?? {}),
          apiKey,
        },
      },
    },
  }
}

export function buildProviderApiKeyRemovalSettings(
  currentSettings: SettingsJson,
  providerId: string,
): Pick<SettingsJson, 'provider'> {
  const existingProvider = currentSettings.provider?.[providerId] ?? {}
  return {
    provider: {
      ...currentSettings.provider,
      [providerId]: {
        ...existingProvider,
        options: {
          ...(existingProvider.options ?? {}),
          apiKey: undefined,
        },
      },
    },
  }
}

export function formatProviderList(): string[] {
  return getProviderCatalog().map((provider, index) => {
    const auth = provider.authMethods.join(', ')
    const env = provider.env.length
      ? provider.env.join(', ')
      : 'configured endpoint'
    return `${String(index + 1).padStart(3)}. ${provider.id.padEnd(28)} ${provider.name.padEnd(30)} auth: ${auth}; env: ${env}`
  })
}

export function formatAuthProviderList(): string[] {
  return [
    `  1. ${CODEX_AUTH_PROVIDER.id.padEnd(28)} ${CODEX_AUTH_PROVIDER.name.padEnd(30)} auth: ${CODEX_AUTH_PROVIDER.authMethods.join(', ')}`,
    ...getProviderCatalog().map((provider, index) => {
      const auth = provider.authMethods.join(', ')
      const env = provider.env.length
        ? provider.env.join(', ')
        : 'configured endpoint'
      return `${String(index + 2).padStart(3)}. ${provider.id.padEnd(28)} ${provider.name.padEnd(30)} auth: ${auth}; env: ${env}`
    }),
  ]
}
