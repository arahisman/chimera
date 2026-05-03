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
import { AbortError } from '../entrypoints/agentSdkTypes.js'

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

export type IdePromptRunnerInput = {
  prompt: string
  cwd?: string
  model: string
  permissionMode: IdeSetPermissionModeResult['mode']
  sessionId?: string
  signal: AbortSignal
}

export type IdePromptRunner = (
  input: IdePromptRunnerInput,
) => AsyncIterable<unknown>

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
  promptRunner?: IdePromptRunner
  discoverExternalModels?: boolean
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
  let activePrompt: AbortController | undefined
  const checkpoints = new Map<string, IdeCheckpointResult>()
  const pendingPermissions = new Map<
    string,
    (decision: IdePermissionDecisionResult) => void
  >()

  return {
    async initialize(params, context): Promise<IdeInitializeResult> {
      const cliVersion = context.cliVersion || options.cliVersion
      const models = await buildIdeModels(currentModel, {
        discoverExternalModels: options.discoverExternalModels ?? true,
      })
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
      if (activePrompt) {
        throw new IdeRuntimeError(
          'A Chimera IDE task is already running. Interrupt it before starting another one.',
          -32040,
        )
      }
      const controller = new AbortController()
      activePrompt = controller
      options.emitEvent?.('status', {
        state: 'thinking',
        label: `Working on: ${input.prompt.slice(0, 80)}`,
        sessionId: currentSession?.id,
      })
      try {
        const runner = options.promptRunner ?? defaultIdePromptRunner
        const cwd =
          normalizeIdeContext(input.context ?? {}).workspaceRoots[0] ??
          latestContext?.workspaceRoots[0]
        let sawResult = false
        let sawAssistantText = false
        for await (const message of runner({
          prompt: input.prompt,
          cwd,
          model: currentModel,
          permissionMode,
          sessionId: currentSession?.id,
          signal: controller.signal,
        })) {
          const result = emitSdkMessage(options.emitEvent, message, {
            suppressResultText: sawAssistantText,
          })
          if (result.emittedAssistantText) sawAssistantText = true
          if (result.sessionId) {
            currentSession = {
              id: result.sessionId,
              title: currentSession?.title,
            }
          }
          if (result.finalState) {
            sawResult = true
            options.emitEvent?.('status', {
              state: result.finalState,
              label: result.finalLabel,
              sessionId: result.sessionId ?? currentSession?.id,
            })
          }
        }
        if (!sawResult) {
          options.emitEvent?.('status', {
            state: 'done',
            label: 'Task completed.',
            sessionId: currentSession?.id,
          })
        }
        return { accepted: true }
      } catch (error) {
        if (error instanceof AbortError || controller.signal.aborted) {
          options.emitEvent?.('status', {
            state: 'idle',
            label: 'Task interrupted.',
            sessionId: currentSession?.id,
          })
          return { accepted: false }
        }
        options.emitEvent?.('status', {
          state: 'error',
          label: error instanceof Error ? error.message : String(error),
          sessionId: currentSession?.id,
        })
        throw error
      } finally {
        if (activePrompt === controller) activePrompt = undefined
      }
    },

    async interrupt(): Promise<IdeInterruptResult> {
      const running = activePrompt
      running?.abort()
      return { interrupted: Boolean(running) }
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
      return {
        models: await buildIdeModels(currentModel, {
          discoverExternalModels: options.discoverExternalModels ?? true,
        }),
      }
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

async function buildIdeModels(
  currentModel: string,
  options: { discoverExternalModels: boolean } = { discoverExternalModels: true },
): Promise<IdeModelsResult['models']> {
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
  if (options.discoverExternalModels) {
    try {
      discovered = await fetchModelsDevExternalModelOptions(settings.provider)
    } catch {
      discovered = []
    }
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

async function* defaultIdePromptRunner(
  input: IdePromptRunnerInput,
): AsyncIterable<unknown> {
  const { query } = await import('../entrypoints/agentSdkTypes.js')
  const stream = query({
    prompt: input.prompt,
    options: {
      cwd: input.cwd,
      model: input.model,
      permissionMode: input.permissionMode,
      sessionId: input.sessionId,
      signal: input.signal,
    },
  }) as AsyncIterable<unknown>
  for await (const message of stream) {
    yield message
  }
}

function emitSdkMessage(
  emitEvent: IdeRuntimeEventSink | undefined,
  message: unknown,
  options: { suppressResultText?: boolean } = {},
): {
  sessionId?: string
  finalState?: 'done' | 'error'
  finalLabel?: string
  emittedAssistantText?: boolean
} {
  if (!message || typeof message !== 'object') return {}
  const record = message as Record<string, unknown>
  const sessionId =
    typeof record.session_id === 'string' ? record.session_id : undefined
  const type = record.type

  if (type === 'assistant' || type === 'streamlined_text') {
    const text =
      type === 'streamlined_text'
        ? typeof record.text === 'string'
          ? record.text
          : ''
        : extractAssistantText(record.message)
    let emittedAssistantText = false
    if (text.trim()) {
      emitEvent?.('assistant.message', {
        id: typeof record.uuid === 'string' ? record.uuid : undefined,
        sessionId,
        text,
      })
      emittedAssistantText = true
    }
    for (const tool of extractToolUses(record.message)) {
      emitEvent?.('tool.started', {
        id: tool.id,
        name: tool.name,
        input: tool.input,
        sessionId,
      })
    }
    return { sessionId, emittedAssistantText }
  }

  if (type === 'streamlined_tool_use_summary') {
    const summary = typeof record.tool_summary === 'string' ? record.tool_summary : ''
    if (summary.trim()) {
      emitEvent?.('tool.updated', { summary, sessionId })
    }
    return { sessionId }
  }

  if (type === 'system') {
    const subtype = record.subtype
    if (subtype === 'status') {
      const status = typeof record.status === 'string' ? record.status : undefined
      const label = status ?? 'Status updated.'
      emitEvent?.('status', {
        state: statusToIdeState(status),
        label,
        sessionId,
      })
    }
    return { sessionId }
  }

  if (type === 'result') {
    const isError = record.is_error === true || record.subtype !== 'success'
    const result = typeof record.result === 'string' ? record.result : ''
    if (result.trim() && !options.suppressResultText) {
      emitEvent?.('assistant.message', {
        id: typeof record.uuid === 'string' ? record.uuid : undefined,
        sessionId,
        text: result,
        final: true,
      })
    }
    return {
      sessionId,
      finalState: isError ? 'error' : 'done',
      finalLabel: isError ? result || 'Task failed.' : 'Task completed.',
    }
  }

  return { sessionId }
}

function statusToIdeState(
  status: string | undefined,
): 'idle' | 'thinking' | 'working' | 'editing' | 'done' | 'error' {
  switch (status) {
    case 'idle':
      return 'idle'
    case 'success':
    case 'completed':
      return 'done'
    case 'error':
    case 'failed':
      return 'error'
    case 'requires_action':
      return 'editing'
    default:
      return 'working'
  }
}

function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(block => {
      if (!block || typeof block !== 'object') return ''
      const record = block as Record<string, unknown>
      return record.type === 'text' && typeof record.text === 'string'
        ? record.text
        : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

function extractToolUses(
  message: unknown,
): Array<{ id?: string; name?: string; input?: unknown }> {
  if (!message || typeof message !== 'object') return []
  const content = (message as { content?: unknown }).content
  if (!Array.isArray(content)) return []
  return content
    .map(block => {
      if (!block || typeof block !== 'object') return undefined
      const record = block as Record<string, unknown>
      if (record.type !== 'tool_use') return undefined
      return {
        id: typeof record.id === 'string' ? record.id : undefined,
        name: typeof record.name === 'string' ? record.name : undefined,
        input: record.input,
      }
    })
    .filter(Boolean) as Array<{ id?: string; name?: string; input?: unknown }>
}
