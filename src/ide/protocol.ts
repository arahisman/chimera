import { z } from 'zod/v4'

export const CHIMERA_IDE_PROTOCOL_VERSION = 'chimera.ide.v1' as const

export type ChimeraIdeProtocolVersion = typeof CHIMERA_IDE_PROTOCOL_VERSION

export const IdeCapabilitySchema = z.object({
  context: z.boolean().optional(),
  diff: z.boolean().optional(),
  permissions: z.boolean().optional(),
  auth: z.boolean().optional(),
  models: z.boolean().optional(),
  sessions: z.boolean().optional(),
  mcp: z.boolean().optional(),
  plugins: z.boolean().optional(),
})

export const IdeEditorSchema = z.object({
  kind: z.enum(['vscode', 'cursor', 'windsurf']),
  name: z.string(),
  version: z.string().optional(),
})

export const IdeWorkspaceFolderSchema = z.object({
  uri: z.string(),
  name: z.string(),
})

export const IdeRangeSchema = z.object({
  start: z.object({
    line: z.number().int().nonnegative(),
    character: z.number().int().nonnegative(),
  }),
  end: z.object({
    line: z.number().int().nonnegative(),
    character: z.number().int().nonnegative(),
  }),
})

export const IdeDiagnosticSchema = z.object({
  uri: z.string(),
  range: IdeRangeSchema,
  severity: z.enum(['error', 'warning', 'information', 'hint']),
  message: z.string(),
  source: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional(),
})

export const IdeSelectionSchema = z.object({
  uri: z.string(),
  ranges: z.array(IdeRangeSchema),
  text: z.string().optional(),
  textHash: z.string().optional(),
})

export const IdeGitContextSchema = z.object({
  rootUri: z.string(),
  branch: z.string().optional(),
  changedFiles: z.array(z.string()).default([]),
  stagedFiles: z.array(z.string()).default([]),
})

export const IdeTerminalContextSchema = z.object({
  cwd: z.string().optional(),
  shell: z.string().optional(),
})

export const IdeContextUpdateParamsSchema = z.object({
  workspaceFolders: z.array(IdeWorkspaceFolderSchema).optional(),
  activeFile: z
    .object({
      uri: z.string(),
      languageId: z.string().optional(),
      dirty: z.boolean().optional(),
      selectedRanges: z.array(IdeRangeSchema).optional(),
    })
    .optional(),
  selections: z.array(IdeSelectionSchema).optional(),
  diagnostics: z.array(IdeDiagnosticSchema).optional(),
  visibleEditors: z.array(z.string()).optional(),
  git: IdeGitContextSchema.optional(),
  terminal: IdeTerminalContextSchema.optional(),
})

export const IdeInitializeParamsSchema = z.object({
  protocolVersion: z.literal(CHIMERA_IDE_PROTOCOL_VERSION),
  minProtocolVersion: z.literal(CHIMERA_IDE_PROTOCOL_VERSION),
  extensionVersion: z.string(),
  editor: IdeEditorSchema,
  workspaceFolders: z.array(IdeWorkspaceFolderSchema),
  capabilities: IdeCapabilitySchema,
})

export const IdeAccountSchema = z.object({
  loggedIn: z.boolean(),
  email: z.string().optional(),
  provider: z.string().optional(),
})

export const IdeModelSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  provider: z.string().optional(),
  contextWindow: z.number().int().positive().optional(),
  outputLimit: z.number().int().positive().optional(),
  current: z.boolean().optional(),
  available: z.boolean().optional(),
})

export const IdeInitializeResultSchema = z.object({
  protocolVersion: z.literal(CHIMERA_IDE_PROTOCOL_VERSION),
  cliVersion: z.string(),
  account: IdeAccountSchema,
  models: z.array(IdeModelSchema),
  permissionMode: z.enum(['default', 'acceptEdits', 'dontAsk']),
  capabilities: IdeCapabilitySchema,
  session: z
    .object({
      id: z.string(),
      title: z.string().optional(),
    })
    .optional(),
})

export const IdeSendPromptParamsSchema = z.object({
  prompt: z.string(),
  context: IdeContextUpdateParamsSchema.optional(),
})

export const IdeSetModelParamsSchema = z.object({
  model: z.string(),
})

export const IdeSetPermissionModeParamsSchema = z.object({
  mode: z.enum(['default', 'acceptEdits', 'dontAsk']),
})

export const IdeAuthLoginParamsSchema = z.object({
  providerId: z.string(),
  apiKey: z.string().optional(),
})

export const IdeAuthLogoutParamsSchema = z.object({
  providerId: z.string(),
})

export const IdeAuthProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['codex', 'external']),
  authMethods: z.array(z.string()),
  connected: z.boolean(),
  env: z.array(z.string()).optional(),
})

export const IdeAuthProvidersResultSchema = z.object({
  providers: z.array(IdeAuthProviderSchema),
})

export const IdeAuthResultSchema = z.object({
  providerId: z.string(),
  connected: z.boolean(),
  message: z.string().optional(),
})

export const IdeModelsResultSchema = z.object({
  models: z.array(IdeModelSchema),
})

export const IdeMcpStatusResultSchema = z.object({
  enabled: z.boolean(),
  servers: z.array(
    z.object({
      name: z.string(),
      scope: z.string().optional(),
      status: z.string().optional(),
    }),
  ),
})

export const IdeReloadResultSchema = z.object({
  reloaded: z.boolean(),
  message: z.string().optional(),
})

export const IdeSessionSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  summary: z.string().optional(),
  cwd: z.string().optional(),
  gitBranch: z.string().optional(),
  lastModified: z.number().optional(),
})

export const IdeSessionListResultSchema = z.object({
  sessions: z.array(IdeSessionSchema),
})

export const IdeSessionResumeParamsSchema = z.object({
  sessionId: z.string(),
})

export const IdeSessionResumeResultSchema = z.object({
  session: IdeSessionSchema,
  message: z.string().optional(),
})

export const IdeCheckpointParamsSchema = z.object({
  label: z.string().optional(),
})

export const IdeCheckpointResultSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  createdAt: z.number(),
  impactedFiles: z.array(z.string()).default([]),
})

export const IdeRollbackParamsSchema = z.object({
  checkpointId: z.string(),
})

export const IdeRollbackResultSchema = z.object({
  rolledBack: z.boolean(),
  impactedFiles: z.array(z.string()).default([]),
  message: z.string().optional(),
})

export const IdeStatusEventParamsSchema = z.object({
  state: z.enum([
    'idle',
    'thinking',
    'working',
    'editing',
    'installing',
    'committing',
    'pushing',
    'done',
    'error',
  ]),
  label: z.string().optional(),
  sessionId: z.string().optional(),
})

export const IdePermissionRequestParamsSchema = z.object({
  id: z.string(),
  toolUseId: z.string(),
  toolName: z.string(),
  displayName: z.string().optional(),
  inputSummary: z.string().optional(),
  affectedPaths: z.array(z.string()).optional(),
  risk: z.enum(['low', 'medium', 'high']).optional(),
  suggestedRules: z.array(z.string()).optional(),
  decisionReason: z.string().optional(),
})

export const IdePermissionResponseParamsSchema = z.object({
  id: z.string(),
  decision: z.enum(['allowOnce', 'deny', 'alwaysAllow', 'dontAsk']),
  reason: z.string().optional(),
})

export const IdeDiffProposedParamsSchema = z.object({
  id: z.string(),
  toolUseId: z.string().optional(),
  filePath: z.string(),
  originalText: z.string(),
  proposedText: z.string(),
})

export const IdeRequestMethodSchema = z.enum([
  'initialize',
  'sendPrompt',
  'interrupt',
  'setModel',
  'setPermissionMode',
  'context.update',
  'permission.respond',
  'auth.listProviders',
  'auth.login',
  'auth.logout',
  'models.list',
  'session.list',
  'session.resume',
  'session.checkpoint',
  'session.rollback',
  'mcp.status',
  'mcp.reload',
  'plugins.reload',
])

export const IdeEventNameSchema = z.enum([
  'status',
  'assistant.delta',
  'assistant.message',
  'tool.started',
  'tool.updated',
  'tool.completed',
  'diff.proposed',
  'edit.applied',
  'permission.request',
  'checkpoint.created',
  'session.updated',
  'error',
])

const JsonRpcVersionSchema = z.literal('2.0')

export const ChimeraIdeRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: z.union([z.string(), z.number()]),
  method: IdeRequestMethodSchema,
  params: z.unknown().optional(),
})

export const ChimeraIdeNotificationSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  method: z.string().refine(method => method.startsWith('event/'), {
    message: 'IDE notifications must use event/<name> methods',
  }),
  params: z.unknown().optional(),
})

export const ChimeraIdeResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: z.union([z.string(), z.number()]),
  result: z.unknown(),
})

export const ChimeraIdeErrorResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: z.union([z.string(), z.number()]).nullable(),
  error: z.object({
    code: z.number().int(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
})

export const ChimeraIdeMessageSchema = z.union([
  ChimeraIdeRequestSchema,
  ChimeraIdeNotificationSchema,
  ChimeraIdeResponseSchema,
  ChimeraIdeErrorResponseSchema,
])

export type IdeCapability = z.infer<typeof IdeCapabilitySchema>
export type IdeInitializeParams = z.infer<typeof IdeInitializeParamsSchema>
export type IdeInitializeResult = z.infer<typeof IdeInitializeResultSchema>
export type IdeContextUpdateParams = z.infer<typeof IdeContextUpdateParamsSchema>
export type IdeSendPromptParams = z.infer<typeof IdeSendPromptParamsSchema>
export type IdeSetModelParams = z.infer<typeof IdeSetModelParamsSchema>
export type IdeSetPermissionModeParams = z.infer<
  typeof IdeSetPermissionModeParamsSchema
>
export type IdeAuthLoginParams = z.infer<typeof IdeAuthLoginParamsSchema>
export type IdeAuthLogoutParams = z.infer<typeof IdeAuthLogoutParamsSchema>
export type IdeAuthProvider = z.infer<typeof IdeAuthProviderSchema>
export type IdeAuthProvidersResult = z.infer<typeof IdeAuthProvidersResultSchema>
export type IdeAuthResult = z.infer<typeof IdeAuthResultSchema>
export type IdeModelsResult = z.infer<typeof IdeModelsResultSchema>
export type IdeMcpStatusResult = z.infer<typeof IdeMcpStatusResultSchema>
export type IdeReloadResult = z.infer<typeof IdeReloadResultSchema>
export type IdeSession = z.infer<typeof IdeSessionSchema>
export type IdeSessionListResult = z.infer<typeof IdeSessionListResultSchema>
export type IdeSessionResumeParams = z.infer<typeof IdeSessionResumeParamsSchema>
export type IdeSessionResumeResult = z.infer<typeof IdeSessionResumeResultSchema>
export type IdeCheckpointParams = z.infer<typeof IdeCheckpointParamsSchema>
export type IdeCheckpointResult = z.infer<typeof IdeCheckpointResultSchema>
export type IdeRollbackParams = z.infer<typeof IdeRollbackParamsSchema>
export type IdeRollbackResult = z.infer<typeof IdeRollbackResultSchema>
export type IdeStatusEventParams = z.infer<typeof IdeStatusEventParamsSchema>
export type IdePermissionRequestParams = z.infer<
  typeof IdePermissionRequestParamsSchema
>
export type IdePermissionResponseParams = z.infer<
  typeof IdePermissionResponseParamsSchema
>
export type IdeEventName = z.infer<typeof IdeEventNameSchema>
export type IdeDiffProposedParams = z.infer<typeof IdeDiffProposedParamsSchema>
export type ChimeraIdeRequest = z.infer<typeof ChimeraIdeRequestSchema>
export type ChimeraIdeNotification = z.infer<
  typeof ChimeraIdeNotificationSchema
>
export type ChimeraIdeResponse = z.infer<typeof ChimeraIdeResponseSchema>
export type ChimeraIdeErrorResponse = z.infer<
  typeof ChimeraIdeErrorResponseSchema
>
export type ChimeraIdeMessage = z.infer<typeof ChimeraIdeMessageSchema>

export function createIdeRequest(
  id: string | number,
  method: z.infer<typeof IdeRequestMethodSchema>,
  params?: unknown,
): ChimeraIdeRequest {
  return {
    jsonrpc: '2.0',
    id,
    method,
    ...(params === undefined ? {} : { params }),
  }
}

export function createIdeResponse(
  id: string | number,
  result: unknown,
): ChimeraIdeResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  }
}

export function createIdeError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): ChimeraIdeErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  }
}

export function createIdeEvent(
  name: z.infer<typeof IdeEventNameSchema>,
  params?: unknown,
): ChimeraIdeNotification {
  return {
    jsonrpc: '2.0',
    method: `event/${name}`,
    ...(params === undefined ? {} : { params }),
  }
}

export function isIdeRequest(
  message: ChimeraIdeMessage,
): message is ChimeraIdeRequest {
  return 'method' in message && 'id' in message
}

export function isIdeResponse(
  message: ChimeraIdeMessage,
): message is ChimeraIdeResponse {
  return 'result' in message && 'id' in message
}

export function isIdeNotification(
  message: ChimeraIdeMessage,
): message is ChimeraIdeNotification {
  return 'method' in message && !('id' in message)
}
