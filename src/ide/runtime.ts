import {
  CHIMERA_IDE_PROTOCOL_VERSION,
  type IdeAuthLoginParams,
  type IdeAuthLogoutParams,
  type IdeAuthProvidersResult,
  type IdeAuthResult,
  type IdeCheckpointParams,
  type IdeCheckpointResult,
  type IdeContextUpdateParams,
  type IdeDiffProposedParams,
  type IdeEventName,
  type IdeInitializeParams,
  type IdeInitializeResult,
  type IdeMcpStatusResult,
  type IdeModelsResult,
  type IdePermissionRequestParams,
  type IdePermissionResponseParams,
  type IdeReloadResult,
  type IdeRollbackParams,
  type IdeRollbackResult,
  type IdeSendPromptParams,
  type IdeSessionListResult,
  type IdeSessionResumeParams,
  type IdeSessionResumeResult,
  type IdeSetModelParams,
  type IdeSetPermissionModeParams,
} from './protocol.js'
import {
  normalizeIdeContext,
  type NormalizedIdeContext,
} from './context.js'
import { listCodexModels } from '../services/codex/models/registry.js'
import { hasCodexTokensSync } from '../services/codex/auth/token-store.js'
import {
  CODEX_AUTH_PROVIDER,
  buildProviderApiKeyRemovalSettings,
  buildProviderApiKeySettings,
} from '../services/providers/configure.js'
import {
  getConfiguredExternalModelOptions,
  getProviderCatalog,
  getProviderInfo,
} from '../services/providers/catalog.js'
import {
  fetchModelsDevExternalModelOptions,
  getConnectedExternalProviderIds,
  mergeExternalModelOptions,
} from '../services/providers/modelsDev.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
import { validateModel } from '../utils/model/validateModel.js'
import { listSessionsImpl } from '../utils/listSessionsImpl.js'

export type ChimeraIdeRuntimeContext = {
  cliVersion: string
}

export type IdeSendPromptResult = {
  accepted: boolean
}

export type IdeInterruptResult = {
  interrupted: boolean
}

export type IdeSetModelResult = {
  model: string
}

export type IdeSetPermissionModeResult = {
  mode: 'default' | 'acceptEdits' | 'dontAsk'
}

export type IdeContextUpdateResult = {
  accepted: true
}

export type IdeDiffProposedResult = {
  id: string
}

export type IdePermissionDecisionResult = {
  id: string
  decision: IdePermissionResponseParams['decision']
  reason?: string
}

export type IdePermissionResponseResult = {
  accepted: true
  decision: IdePermissionResponseParams['decision']
}

export type IdeRuntimeEventSink = (
  name: IdeEventName,
  params?: unknown,
) => void

export type ChimeraIdeRuntime = {
  initialize(
    params: IdeInitializeParams,
    context: ChimeraIdeRuntimeContext,
  ): Promise<IdeInitializeResult>
  sendPrompt(input: IdeSendPromptParams): Promise<IdeSendPromptResult>
  interrupt(): Promise<IdeInterruptResult>
  setModel(input: IdeSetModelParams): Promise<IdeSetModelResult>
  setPermissionMode(
    input: IdeSetPermissionModeParams,
  ): Promise<IdeSetPermissionModeResult>
  updateContext(input: IdeContextUpdateParams): Promise<IdeContextUpdateResult>
  proposeDiff(input: IdeDiffProposedParams): Promise<IdeDiffProposedResult>
  requestPermission(
    input: IdePermissionRequestParams,
  ): Promise<IdePermissionDecisionResult>
  respondPermission(
    input: IdePermissionResponseParams,
  ): Promise<IdePermissionResponseResult>
  listAuthProviders(): Promise<IdeAuthProvidersResult>
  login(input: IdeAuthLoginParams): Promise<IdeAuthResult>
  logout(input: IdeAuthLogoutParams): Promise<IdeAuthResult>
  listModels(): Promise<IdeModelsResult>
  mcpStatus(): Promise<IdeMcpStatusResult>
  mcpReload(): Promise<IdeReloadResult>
  pluginsReload(): Promise<IdeReloadResult>
  listSessions(): Promise<IdeSessionListResult>
  resumeSession(input: IdeSessionResumeParams): Promise<IdeSessionResumeResult>
  createCheckpoint(input: IdeCheckpointParams): Promise<IdeCheckpointResult>
  rollback(input: IdeRollbackParams): Promise<IdeRollbackResult>
  getContext(): NormalizedIdeContext | undefined
}

export type IdeRuntimeOptions = {
  cliVersion: string
  emitEvent?: IdeRuntimeEventSink
}

export class IdeRuntimeError extends Error {
  constructor(
    message: string,
    readonly code = -32000,
    readonly data?: unknown,
  ) {
    super(message)
    this.name = 'IdeRuntimeError'
  }
}

export function createDefaultIdeRuntime(
  options: IdeRuntimeOptions,
): ChimeraIdeRuntime {
  let currentModel = 'gpt-5.5'
  let permissionMode: IdeSetPermissionModeResult['mode'] = 'default'
  let latestContext: NormalizedIdeContext | undefined
  let currentSession: IdeSessionResumeResult['session'] | undefined
  const checkpoints = new Map<string, IdeCheckpointResult>()
  const pendingPermissions = new Map<
    string,
    (decision: IdePermissionDecisionResult) => void
  >()

  return {
    async initialize(params, context): Promise<IdeInitializeResult> {
      const cliVersion = context.cliVersion || options.cliVersion
      const models = await buildIdeModels(currentModel)
      return {
        protocolVersion: CHIMERA_IDE_PROTOCOL_VERSION,
        cliVersion,
        account: { loggedIn: hasCodexTokensSync(), provider: 'codex' },
        models,
        permissionMode,
        capabilities: {
          context: Boolean(params.capabilities.context),
          diff: Boolean(params.capabilities.diff),
          permissions: Boolean(params.capabilities.permissions),
          auth: true,
          models: true,
          sessions: true,
          mcp: false,
          plugins: false,
        },
        session: currentSession,
      }
    },

    async sendPrompt(input): Promise<IdeSendPromptResult> {
      options.emitEvent?.('status', {
        state: 'thinking',
        label: `Accepted IDE task: ${input.prompt.slice(0, 80)}`,
        sessionId: currentSession?.id,
      })
      options.emitEvent?.('status', {
        state: 'done',
        label:
          'IDE task accepted; live agent execution will attach through the runtime bridge.',
        sessionId: currentSession?.id,
      })
      return { accepted: true }
    },

    async interrupt(): Promise<IdeInterruptResult> {
      return { interrupted: false }
    },

    async setModel(input): Promise<IdeSetModelResult> {
      const model = input.model.trim()
      const validation = await validateModel(model)
      if (!validation.valid) {
        throw new IdeRuntimeError(
          validation.error ?? `Model '${model}' is not supported by Chimera`,
          -32010,
          { model },
        )
      }
      currentModel = model
      return { model: currentModel }
    },

    async setPermissionMode(input): Promise<IdeSetPermissionModeResult> {
      permissionMode = input.mode
      return { mode: permissionMode }
    },

    async updateContext(input): Promise<IdeContextUpdateResult> {
      latestContext = normalizeIdeContext(input)
      return { accepted: true }
    },

    async proposeDiff(input): Promise<IdeDiffProposedResult> {
      options.emitEvent?.('diff.proposed', input)
      return { id: input.id }
    },

    async requestPermission(input): Promise<IdePermissionDecisionResult> {
      options.emitEvent?.('permission.request', input)
      return new Promise(resolve => {
        pendingPermissions.set(input.id, resolve)
      })
    },

    async respondPermission(input): Promise<IdePermissionResponseResult> {
      const pending = pendingPermissions.get(input.id)
      pendingPermissions.delete(input.id)
      if (input.decision === 'dontAsk') {
        permissionMode = 'dontAsk'
      }
      pending?.({
        id: input.id,
        decision: input.decision,
        reason: input.reason,
      })
      return { accepted: true, decision: input.decision }
    },

    async listAuthProviders(): Promise<IdeAuthProvidersResult> {
      return buildAuthProviders()
    },

    async login(input): Promise<IdeAuthResult> {
      const providerId = input.providerId.trim().toLowerCase()
      if (providerId === 'codex') {
        return {
          providerId: 'codex',
          connected: hasCodexTokensSync(),
          message: hasCodexTokensSync()
            ? 'Codex OAuth is already connected.'
            : 'Run `chimera login codex` in a terminal to complete Codex OAuth.',
        }
      }

      const provider = getProviderInfo(providerId)
      if (!provider) {
        throw new IdeRuntimeError(`Unknown provider: ${input.providerId}`, -32020)
      }
      const apiKey = input.apiKey?.trim()
      if (!apiKey) {
        throw new IdeRuntimeError(`API key is required for ${provider.name}`, -32021)
      }
      const currentSettings = getSettingsForSource('userSettings') ?? {}
      const result = updateSettingsForSource(
        'userSettings',
        buildProviderApiKeySettings(currentSettings, provider.id, apiKey),
      )
      if (result.error) throw result.error
      return {
        providerId: provider.id,
        connected: true,
        message: `Saved API key for ${provider.name}.`,
      }
    },

    async logout(input): Promise<IdeAuthResult> {
      const providerId = input.providerId.trim().toLowerCase()
      if (providerId === 'codex') {
        return {
          providerId: 'codex',
          connected: hasCodexTokensSync(),
          message: 'Run `chimera logout codex` in a terminal to clear Codex OAuth.',
        }
      }

      const provider = getProviderInfo(providerId)
      if (!provider) {
        throw new IdeRuntimeError(`Unknown provider: ${input.providerId}`, -32020)
      }
      const currentSettings = getSettingsForSource('userSettings') ?? {}
      const result = updateSettingsForSource(
        'userSettings',
        buildProviderApiKeyRemovalSettings(currentSettings, provider.id),
      )
      if (result.error) throw result.error
      return {
        providerId: provider.id,
        connected: false,
        message: `Removed API key for ${provider.name}.`,
      }
    },

    async listModels(): Promise<IdeModelsResult> {
      return { models: await buildIdeModels(currentModel) }
    },

    async mcpStatus(): Promise<IdeMcpStatusResult> {
      const settings = getSettingsForSource('userSettings') ?? {}
      const servers = Object.entries(settings.mcpServers ?? {}).map(([name]) => ({
        name,
        scope: 'user',
        status: 'configured',
      }))
      return { enabled: servers.length > 0, servers }
    },

    async mcpReload(): Promise<IdeReloadResult> {
      return {
        reloaded: true,
        message: 'MCP configuration will be picked up by the next Chimera session.',
      }
    },

    async pluginsReload(): Promise<IdeReloadResult> {
      return {
        reloaded: true,
        message: 'Plugin configuration will be picked up by the next Chimera session.',
      }
    },

    async listSessions(): Promise<IdeSessionListResult> {
      const dir = latestContext?.workspaceRoots[0]
      const sessions = await listSessionsImpl({ dir, limit: 50 })
      return {
        sessions: sessions.map(session => ({
          id: session.sessionId,
          title: session.customTitle,
          summary: session.summary,
          cwd: session.cwd,
          gitBranch: session.gitBranch,
          lastModified: session.lastModified,
        })),
      }
    },

    async resumeSession(input): Promise<IdeSessionResumeResult> {
      const sessions = await this.listSessions()
      const session =
        sessions.sessions.find(candidate => candidate.id === input.sessionId) ??
        {
          id: input.sessionId,
          title: input.sessionId,
        }
      currentSession = session
      return {
        session,
        message: `Selected session ${session.title ?? session.id}.`,
      }
    },

    async createCheckpoint(input): Promise<IdeCheckpointResult> {
      const checkpoint = {
        id: `ide-${Date.now().toString(36)}`,
        label: input.label,
        createdAt: Date.now(),
        impactedFiles: latestContext?.visibleFiles ?? [],
      }
      checkpoints.set(checkpoint.id, checkpoint)
      options.emitEvent?.('checkpoint.created', checkpoint)
      return checkpoint
    },

    async rollback(input): Promise<IdeRollbackResult> {
      const checkpoint = checkpoints.get(input.checkpointId)
      if (!checkpoint) {
        throw new IdeRuntimeError(
          `Unknown checkpoint: ${input.checkpointId}`,
          -32030,
        )
      }
      return {
        rolledBack: false,
        impactedFiles: checkpoint.impactedFiles,
        message:
          'Rollback preview is ready; file restore will be handled by the connected agent runtime.',
      }
    },

    getContext(): NormalizedIdeContext | undefined {
      return latestContext
    },
  }
}

async function buildAuthProviders(): Promise<IdeAuthProvidersResult> {
  const settings = getSettingsForSource('userSettings') ?? {}
  const connected = new Set(
    getConnectedExternalProviderIds(settings.provider, process.env),
  )
  return {
    providers: [
      {
        id: CODEX_AUTH_PROVIDER.id,
        name: CODEX_AUTH_PROVIDER.name,
        kind: 'codex',
        authMethods: [...CODEX_AUTH_PROVIDER.authMethods],
        connected: hasCodexTokensSync(),
      },
      ...getProviderCatalog().map(provider => ({
        id: provider.id,
        name: provider.name,
        kind: 'external' as const,
        authMethods: [...provider.authMethods],
        connected: connected.has(provider.id),
        env: [...provider.env],
      })),
    ],
  }
}

async function buildIdeModels(currentModel: string): Promise<IdeModelsResult['models']> {
  const settings = getSettingsForSource('userSettings') ?? {}
  const codexModels = listCodexModels().map(model => ({
    id: model.id,
    label: model.label,
    provider: 'codex',
    contextWindow: model.contextWindow,
    outputLimit: model.maxOutputTokens,
    current: model.id === currentModel,
    available: true,
  }))
  const configured = getConfiguredExternalModelOptions(settings.provider)
  let discovered: typeof configured = []
  try {
    discovered = await fetchModelsDevExternalModelOptions(settings.provider)
  } catch {
    discovered = []
  }
  const externalModels = mergeExternalModelOptions(configured, discovered).map(
    option => ({
      id: option.value,
      label: option.label,
      provider: option.value.split('/')[0],
      current: option.value === currentModel,
      available: true,
    }),
  )
  return [...codexModels, ...externalModels]
}
