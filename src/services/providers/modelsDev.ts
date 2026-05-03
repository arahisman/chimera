import {
  getProviderCatalog,
  getProviderInfo,
  type ExternalProviderConfig,
  type ExternalProviderModelOption,
} from './catalog.js'

const MODELS_DEV_URL =
  process.env.CHIMERA_MODELS_DEV_URL ?? 'https://models.dev/api.json'
const CACHE_TTL_MS = 5 * 60 * 1000

type ModelsDevModel = {
  id?: string
  name?: string
  limit?: {
    context?: number
    output?: number
  }
}

type ModelsDevProvider = {
  name?: string
  models?: Record<string, ModelsDevModel>
}

export type ModelsDevData = Record<string, ModelsDevProvider>

let cache:
  | {
      expiresAt: number
      data: ModelsDevData
    }
  | undefined

export function getConnectedExternalProviderIds(
  providers: Record<string, ExternalProviderConfig> | undefined,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const connected = new Set<string>()

  for (const [rawProviderId, providerConfig] of Object.entries(providers ?? {})) {
    const provider = getProviderInfo(rawProviderId)
    if (!provider) continue
    if (isProviderConfigConnected(providerConfig)) {
      connected.add(provider.id)
    }
  }

  for (const provider of getProviderCatalog()) {
    if (provider.env.some(key => isNonEmptyString(env[key]))) {
      connected.add(provider.id)
    }
  }

  return getProviderCatalog()
    .map(provider => provider.id)
    .filter(providerId => connected.has(providerId))
}

export function getModelsDevExternalModelOptions(
  data: ModelsDevData,
  providers: Record<string, ExternalProviderConfig> | undefined,
  env: Record<string, string | undefined> = process.env,
): ExternalProviderModelOption[] {
  const connectedProviderIds = getConnectedExternalProviderIds(providers, env)
  const options: ExternalProviderModelOption[] = []

  for (const providerId of connectedProviderIds) {
    const provider = getProviderInfo(providerId)
    const modelsDevProvider = data[providerId]
    if (!provider || !modelsDevProvider?.models) continue

    for (const [modelId, model] of Object.entries(modelsDevProvider.models)) {
      const resolvedModelId = model.id ?? modelId
      options.push({
        value: `${provider.id}/${resolvedModelId}`,
        label: model.name ?? resolvedModelId,
        description: buildModelDescription(
          provider.name,
          resolvedModelId,
          model.limit?.context,
        ),
      })
    }
  }

  return options
}

export async function fetchModelsDevExternalModelOptions(
  providers: Record<string, ExternalProviderConfig> | undefined,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalProviderModelOption[]> {
  if (!getConnectedExternalProviderIds(providers, env).length) {
    return []
  }

  const data = await fetchModelsDevData(fetchImpl)
  return getModelsDevExternalModelOptions(data, providers, env)
}

export function mergeExternalModelOptions(
  primary: ExternalProviderModelOption[],
  discovered: ExternalProviderModelOption[],
): ExternalProviderModelOption[] {
  const seen = new Set<string>()
  const merged: ExternalProviderModelOption[] = []
  for (const option of [...primary, ...discovered]) {
    if (seen.has(option.value)) continue
    seen.add(option.value)
    merged.push(option)
  }
  return merged
}

async function fetchModelsDevData(fetchImpl: typeof fetch): Promise<ModelsDevData> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) {
    return cache.data
  }

  const response = await fetchImpl(MODELS_DEV_URL, {
    headers: {
      'User-Agent': 'chimera-code',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) {
    throw new Error(`models.dev returned HTTP ${response.status}`)
  }

  const data = (await response.json()) as ModelsDevData
  cache = {
    data,
    expiresAt: now + CACHE_TTL_MS,
  }
  return data
}

function isProviderConfigConnected(config: ExternalProviderConfig): boolean {
  const options = config.options ?? {}
  return (
    isNonEmptyString(options.apiKey) ||
    isNonEmptyString(options.accessToken) ||
    isNonEmptyString(options.authToken) ||
    isNonEmptyString(options.oauthToken) ||
    isNonEmptyString(options.token) ||
    options.authenticated === true ||
    options.subscription === true
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function buildModelDescription(
  providerName: string,
  modelId: string,
  contextWindow?: number,
): string {
  const context = contextWindow ? ` · ${formatContext(contextWindow)} context` : ''
  return `${providerName} · ${modelId}${context}`
}

function formatContext(contextWindow: number): string {
  if (contextWindow >= 1000) {
    return `${Math.round(contextWindow / 1000)}k`
  }
  return String(contextWindow)
}
