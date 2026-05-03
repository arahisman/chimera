import {
  CHIMERA_IDE_PROTOCOL_VERSION,
  type IdeContextUpdateParams,
  type IdeDiffProposedParams,
  type IdeEventName,
  type IdeInitializeParams,
  type IdeInitializeResult,
  type IdeSendPromptParams,
  type IdeSetModelParams,
  type IdeSetPermissionModeParams,
} from './protocol.js'
import {
  normalizeIdeContext,
  type NormalizedIdeContext,
} from './context.js'
import { listCodexModels } from '../services/codex/models/registry.js'
import { validateModel } from '../utils/model/validateModel.js'

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

  return {
    async initialize(params, context): Promise<IdeInitializeResult> {
      const cliVersion = context.cliVersion || options.cliVersion
      return {
        protocolVersion: CHIMERA_IDE_PROTOCOL_VERSION,
        cliVersion,
        account: { loggedIn: false },
        models: listCodexModels().map(model => ({
          id: model.id,
          label: model.label,
          provider: 'codex',
          contextWindow: model.contextWindow,
          outputLimit: model.maxOutputTokens,
          current: model.id === currentModel,
          available: true,
        })),
        permissionMode,
        capabilities: {
          context: Boolean(params.capabilities.context),
          diff: Boolean(params.capabilities.diff),
          permissions: Boolean(params.capabilities.permissions),
          auth: true,
          models: true,
          sessions: false,
          mcp: false,
          plugins: false,
        },
      }
    },

    async sendPrompt(): Promise<IdeSendPromptResult> {
      throw new IdeRuntimeError(
        'IDE prompt execution is not connected to the agent runtime yet',
        -32050,
      )
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

    getContext(): NormalizedIdeContext | undefined {
      return latestContext
    },
  }
}
