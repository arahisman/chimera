/**
 * Main entrypoint for Chimera Agent SDK types.
 *
 * This file re-exports the public SDK API from:
 * - sdk/coreTypes.ts - Common serializable types (messages, configs)
 * - sdk/runtimeTypes.ts - Non-serializable types (callbacks, interfaces)
 *
 * SDK builders who need control protocol types should import from
 * sdk/controlTypes.ts directly.
 */

import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { randomUUID } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  findMissedTasks,
  jitteredNextCronRunMs,
  markCronTasksFired,
  oneShotJitteredNextCronRunMs,
  readCronTasks,
  removeCronTasks,
  type CronTask as LocalCronTask,
} from '../utils/cronTasks.js'
import {
  getSessionIdFromLog,
  loadAllProjectsMessageLogsProgressive,
  loadFullLog,
  saveCustomTitle,
  saveTag,
} from '../utils/sessionStorage.js'

// Control protocol types for SDK builders (bridge subpath consumers)
/** @alpha */
export type {
  SDKControlRequest,
  SDKControlResponse,
} from './sdk/controlTypes.js'
// Re-export core types (common serializable types)
export * from './sdk/coreTypes.js'
// Re-export runtime types (callbacks, interfaces with methods)
export * from './sdk/runtimeTypes.js'

// Re-export settings types (generated from settings JSON schema)
export type { Settings } from './sdk/settingsTypes.generated.js'
// Re-export tool types (all marked @internal until SDK API stabilizes)
export * from './sdk/toolTypes.js'

// ============================================================================
// Functions
// ============================================================================

import type {
  SDKMessage,
  SDKResultMessage,
  SDKSessionInfo,
  SDKUserMessage,
} from './sdk/coreTypes.js'
// Import types needed for function signatures
import type {
  AnyZodRawShape,
  ForkSessionOptions,
  ForkSessionResult,
  GetSessionInfoOptions,
  GetSessionMessagesOptions,
  InferShape,
  InternalOptions,
  InternalQuery,
  ListSessionsOptions,
  McpSdkServerConfigWithInstance,
  Options,
  Query,
  SDKSession,
  SDKSessionOptions,
  SdkMcpToolDefinition,
  SessionMessage,
  SessionMutationOptions,
} from './sdk/runtimeTypes.js'

export type {
  ListSessionsOptions,
  GetSessionInfoOptions,
  SessionMutationOptions,
  ForkSessionOptions,
  ForkSessionResult,
  SDKSessionInfo,
}

export function tool<Schema extends AnyZodRawShape>(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: (
    args: InferShape<Schema>,
    extra: unknown,
  ) => Promise<CallToolResult>,
  extras?: {
    annotations?: ToolAnnotations
    searchHint?: string
    alwaysLoad?: boolean
  },
): SdkMcpToolDefinition<Schema> {
  return {
    name,
    description,
    inputSchema,
    handler,
    annotations: extras?.annotations,
    searchHint: extras?.searchHint,
    alwaysLoad: extras?.alwaysLoad,
  }
}

type CreateSdkMcpServerOptions = {
  name: string
  version?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: Array<SdkMcpToolDefinition<any>>
}

/**
 * Creates an MCP server instance that can be used with the SDK transport.
 * This allows SDK users to define custom tools that run in the same process.
 *
 * If your SDK MCP calls will run longer than 60s, override CLAUDE_CODE_STREAM_CLOSE_TIMEOUT
 */
export function createSdkMcpServer(
  options: CreateSdkMcpServerOptions,
): McpSdkServerConfigWithInstance {
  const tools = options.tools ?? []
  const server = new Server(
    { name: options.name, version: options.version ?? '0.0.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: { type: 'object', properties: t.inputSchema ?? {} },
      annotations: t.annotations,
    })),
  }))

  server.setRequestHandler(
    CallToolRequestSchema,
    async ({ params }): Promise<CallToolResult> => {
      const match = tools.find(t => t.name === params.name)
      if (!match) {
        throw new Error(`SDK MCP tool not found: ${params.name}`)
      }
      return (await match.handler(params.arguments ?? {}, {
        toolName: params.name,
      })) as CallToolResult
    },
  )

  return {
    type: 'sdk',
    name: options.name,
    server,
    tools,
  }
}

export class AbortError extends Error {}

/** @internal */
export function query(_params: {
  prompt: string | AsyncIterable<SDKUserMessage>
  options?: InternalOptions
}): InternalQuery
export function query(_params: {
  prompt: string | AsyncIterable<SDKUserMessage>
  options?: Options
}): Query
function getCliPath(): string {
  if (process.env.CHIMERA_CLI_PATH) return process.env.CHIMERA_CLI_PATH
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', '..', 'dist', 'chimera.js')
}

async function promptToString(
  prompt: string | AsyncIterable<SDKUserMessage>,
): Promise<string> {
  if (typeof prompt === 'string') return prompt
  const chunks: string[] = []
  for await (const message of prompt) {
    const content = (message as { message?: { content?: unknown } }).message
      ?.content
    if (typeof content === 'string') chunks.push(content)
    if (Array.isArray(content)) {
      chunks.push(
        ...content
          .map(block =>
            block &&
            typeof block === 'object' &&
            'text' in block &&
            typeof block.text === 'string'
              ? block.text
              : '',
          )
          .filter(Boolean),
      )
    }
  }
  return chunks.join('\n\n')
}

async function* runCliQuery(params: {
  prompt: string | AsyncIterable<SDKUserMessage>
  options?: Options | InternalOptions
}): AsyncGenerator<SDKMessage> {
  const { spawn } = await import('child_process')
  const prompt = await promptToString(params.prompt)
  const args = [
    getCliPath(),
    '--print',
    prompt,
    '--output-format',
    'stream-json',
  ]
  const options = params.options as Record<string, unknown> | undefined
  if (typeof options?.cwd === 'string') args.push('--add-dir', options.cwd)
  if (typeof options?.model === 'string') args.push('--model', options.model)
  if (typeof options?.permissionMode === 'string') {
    args.push('--permission-mode', options.permissionMode)
  }
  const child = spawn(process.execPath, args, {
    cwd: typeof options?.cwd === 'string' ? options.cwd : process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    stderr += chunk
  })

  let buffer = ''
  child.stdout.setEncoding('utf8')
  for await (const chunk of child.stdout) {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) {
        try {
          yield JSON.parse(line) as SDKMessage
        } catch {
          yield { type: 'assistant', message: { content: line } } as SDKMessage
        }
      }
      newline = buffer.indexOf('\n')
    }
  }

  const code = await new Promise<number | null>(resolve =>
    child.once('close', resolve),
  )
  if (code !== 0) {
    throw new Error(stderr.trim() || `Chimera SDK query exited with ${code}`)
  }
}

export function query(params: {
  prompt: string | AsyncIterable<SDKUserMessage>
  options?: Options | InternalOptions
}): Query {
  return runCliQuery(params) as Query
}

/**
 * V2 API - UNSTABLE
 * Create a persistent session for multi-turn conversations.
 * @alpha
 */
export function unstable_v2_createSession(
  options: SDKSessionOptions,
): SDKSession {
  const sessionId = randomUUID()
  return {
    id: sessionId,
    sessionId,
    options,
    prompt: (message: string) =>
      unstable_v2_prompt(message, { ...options, sessionId }),
  }
}

/**
 * V2 API - UNSTABLE
 * Resume an existing session by ID.
 * @alpha
 */
export function unstable_v2_resumeSession(
  sessionId: string,
  options: SDKSessionOptions,
): SDKSession {
  return {
    id: sessionId,
    sessionId,
    options,
    prompt: (message: string) =>
      unstable_v2_prompt(message, { ...options, sessionId }),
  }
}

// @[MODEL LAUNCH]: Update the example model ID in this docstring.
/**
 * V2 API - UNSTABLE
 * One-shot convenience function for single prompts.
 * @alpha
 *
 * @example
 * ```typescript
 * const result = await unstable_v2_prompt("What files are here?", {
 *   model: 'claude-sonnet-4-6'
 * })
 * ```
 */
export async function unstable_v2_prompt(
  message: string,
  options: SDKSessionOptions,
): Promise<SDKResultMessage> {
  let last: SDKMessage | undefined
  for await (const event of runCliQuery({ prompt: message, options })) {
    last = event
  }
  return (last ?? { type: 'result', subtype: 'success' }) as SDKResultMessage
}

/**
 * Reads a session's conversation messages from its JSONL transcript file.
 *
 * Parses the transcript, builds the conversation chain via parentUuid links,
 * and returns user/assistant messages in chronological order. Set
 * `includeSystemMessages: true` in options to also include system messages.
 *
 * @param sessionId - UUID of the session to read
 * @param options - Optional dir, limit, offset, and includeSystemMessages
 * @returns Array of messages, or empty array if session not found
 */
export async function getSessionMessages(
  sessionId: string,
  options?: GetSessionMessagesOptions,
): Promise<SessionMessage[]> {
  const info = await getSessionInfo(sessionId, options)
  if (!info || typeof info.fullPath !== 'string') return []
  const log = await loadFullLog({
    messages: [],
    isLite: true,
    fullPath: info.fullPath,
    value: 0,
    date: String(info.modified ?? info.created ?? new Date().toISOString()),
    created: new Date(String(info.created ?? Date.now())),
    modified: new Date(String(info.modified ?? Date.now())),
    firstPrompt: '',
    messageCount: 0,
    isSidechain: false,
    sessionId,
  } as never)
  const offset = Number((options as Record<string, unknown> | undefined)?.offset ?? 0)
  const limit = (options as Record<string, unknown> | undefined)?.limit
  const messages = log.messages as SessionMessage[]
  return typeof limit === 'number'
    ? messages.slice(offset, offset + limit)
    : messages.slice(offset)
}

/**
 * List sessions with metadata.
 *
 * When `dir` is provided, returns sessions for that project directory
 * and its git worktrees. When omitted, returns sessions across all
 * projects.
 *
 * Use `limit` and `offset` for pagination.
 *
 * @example
 * ```typescript
 * // List sessions for a specific project
 * const sessions = await listSessions({ dir: '/path/to/project' })
 *
 * // Paginate
 * const page1 = await listSessions({ limit: 50 })
 * const page2 = await listSessions({ limit: 50, offset: 50 })
 * ```
 */
export async function listSessions(
  options?: ListSessionsOptions,
): Promise<SDKSessionInfo[]> {
  const limit = (options as Record<string, unknown> | undefined)?.limit
  const offset = Number((options as Record<string, unknown> | undefined)?.offset ?? 0)
  const result = await loadAllProjectsMessageLogsProgressive(
    typeof limit === 'number' ? limit + offset : undefined,
    0,
  )
  const rows = result.allStatLogs.slice(
    offset,
    typeof limit === 'number' ? offset + limit : undefined,
  )
  return rows
    .map(log => {
      const sessionId = getSessionIdFromLog(log)
      if (!sessionId) return undefined
      return {
        id: sessionId,
        sessionId,
        title: log.customTitle ?? log.summary ?? log.firstPrompt,
        firstPrompt: log.firstPrompt,
        created: log.created?.toISOString?.() ?? log.date,
        modified: log.modified?.toISOString?.() ?? log.date,
        fullPath: log.fullPath,
        projectPath: log.projectPath,
        messageCount: log.messageCount,
        gitBranch: log.gitBranch,
        tag: log.tag,
      } as SDKSessionInfo
    })
    .filter(Boolean) as SDKSessionInfo[]
}

/**
 * Reads metadata for a single session by ID. Unlike `listSessions`, this only
 * reads the single session file rather than every session in the project.
 * Returns undefined if the session file is not found, is a sidechain session,
 * or has no extractable summary.
 *
 * @param sessionId - UUID of the session
 * @param options - `{ dir?: string }` project path; omit to search all project directories
 */
export async function getSessionInfo(
  sessionId: string,
  options?: GetSessionInfoOptions,
): Promise<SDKSessionInfo | undefined> {
  const sessions = await listSessions({ ...(options ?? {}), limit: 10000 })
  return sessions.find(
    session =>
      session &&
      typeof session === 'object' &&
      ((session as { id?: string }).id === sessionId ||
        (session as { sessionId?: string }).sessionId === sessionId),
  )
}

/**
 * Rename a session. Appends a custom-title entry to the session's JSONL file.
 * @param sessionId - UUID of the session
 * @param title - New title
 * @param options - `{ dir?: string }` project path; omit to search all projects
 */
export async function renameSession(
  sessionId: string,
  title: string,
  _options?: SessionMutationOptions,
): Promise<void> {
  await saveCustomTitle(sessionId as never, title)
}

/**
 * Tag a session. Pass null to clear the tag.
 * @param sessionId - UUID of the session
 * @param tag - Tag string, or null to clear
 * @param options - `{ dir?: string }` project path; omit to search all projects
 */
export async function tagSession(
  sessionId: string,
  tag: string | null,
  _options?: SessionMutationOptions,
): Promise<void> {
  await saveTag(sessionId as never, tag ?? '')
}

/**
 * Fork a session into a new branch with fresh UUIDs.
 *
 * Copies transcript messages from the source session into a new session file,
 * remapping every message UUID and preserving the parentUuid chain. Supports
 * `upToMessageId` for branching from a specific point in the conversation.
 *
 * Forked sessions start without undo history (file-history snapshots are not
 * copied).
 *
 * @param sessionId - UUID of the source session
 * @param options - `{ dir?, upToMessageId?, title? }`
 * @returns `{ sessionId }` — UUID of the new forked session
 */
export async function forkSession(
  sessionId: string,
  options?: ForkSessionOptions,
): Promise<ForkSessionResult> {
  const info = await getSessionInfo(sessionId, options)
  if (!info || typeof info.fullPath !== 'string') {
    throw new Error(`Session not found: ${sessionId}`)
  }
  const newSessionId = randomUUID()
  const source = await readFile(info.fullPath, 'utf8')
  const uuidMap = new Map<string, string>()
  const upTo = (options as Record<string, unknown> | undefined)?.upToMessageId
  const lines: string[] = []
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue
    const entry = JSON.parse(line) as Record<string, unknown>
    if (typeof entry.uuid === 'string' && !uuidMap.has(entry.uuid)) {
      uuidMap.set(entry.uuid, randomUUID())
    }
    if (typeof entry.uuid === 'string') entry.uuid = uuidMap.get(entry.uuid)
    if (typeof entry.parentUuid === 'string') {
      entry.parentUuid = uuidMap.get(entry.parentUuid) ?? null
    }
    if (typeof entry.sessionId === 'string') entry.sessionId = newSessionId
    lines.push(JSON.stringify(entry))
    if (typeof upTo === 'string' && entry.uuid === uuidMap.get(upTo)) break
  }
  const targetPath = join(dirname(info.fullPath), `${newSessionId}.jsonl`)
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, lines.join('\n') + '\n', 'utf8')
  return { sessionId: newSessionId, id: newSessionId, fullPath: targetPath }
}

// ============================================================================
// Assistant daemon primitives (internal)
// ============================================================================

/**
 * A scheduled task from `<dir>/.claude/scheduled_tasks.json`.
 * @internal
 */
export type CronTask = {
  id: string
  cron: string
  prompt: string
  createdAt: number
  recurring?: boolean
}

/**
 * Cron scheduler tuning knobs (jitter + expiry). Sourced at runtime from the
 * `tengu_kairos_cron_config` GrowthBook config in CLI sessions; daemon hosts
 * pass this through `watchScheduledTasks({ getJitterConfig })` to get the
 * same tuning.
 * @internal
 */
export type CronJitterConfig = {
  recurringFrac: number
  recurringCapMs: number
  oneShotMaxMs: number
  oneShotFloorMs: number
  oneShotMinuteMod: number
  recurringMaxAgeMs: number
}

/**
 * Event yielded by `watchScheduledTasks()`.
 * @internal
 */
export type ScheduledTaskEvent =
  | { type: 'fire'; task: CronTask }
  | { type: 'missed'; tasks: CronTask[] }

/**
 * Handle returned by `watchScheduledTasks()`.
 * @internal
 */
export type ScheduledTasksHandle = {
  /** Async stream of fire/missed events. Drain with `for await`. */
  events(): AsyncGenerator<ScheduledTaskEvent>
  /**
   * Epoch ms of the soonest scheduled fire across all loaded tasks, or null
   * if nothing is scheduled. Useful for deciding whether to tear down an
   * idle agent subprocess or keep it warm for an imminent fire.
   */
  getNextFireTime(): number | null
}

/**
 * Watch `<dir>/.claude/scheduled_tasks.json` and yield events as tasks fire.
 *
 * Acquires the per-directory scheduler lock (PID-based liveness) so a REPL
 * session in the same dir won't double-fire. Releases the lock and closes
 * the file watcher when the signal aborts.
 *
 * - `fire` — a task whose cron schedule was met. One-shot tasks are already
 *   deleted from the file when this yields; recurring tasks are rescheduled
 *   (or deleted if aged out).
 * - `missed` — one-shot tasks whose window passed while the daemon was down.
 *   Yielded once on initial load; a background delete removes them from the
 *   file shortly after.
 *
 * Intended for daemon architectures that own the scheduler externally and
 * spawn the agent via `query()`; the agent subprocess (`-p` mode) does not
 * run its own scheduler.
 *
 * @internal
 */
export function watchScheduledTasks(_opts: {
  dir: string
  signal: AbortSignal
  getJitterConfig?: () => CronJitterConfig
}): ScheduledTasksHandle {
  const opts = _opts
  const queue: ScheduledTaskEvent[] = []
  const waiters: Array<(value: IteratorResult<ScheduledTaskEvent>) => void> = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let nextFireTime: number | null = null

  const push = (event: ScheduledTaskEvent) => {
    const waiter = waiters.shift()
    if (waiter) waiter({ value: event, done: false })
    else queue.push(event)
  }

  const schedule = async () => {
    if (opts.signal.aborted) return
    const now = Date.now()
    const tasks = (await readCronTasks(opts.dir)) as LocalCronTask[]
    const missed = findMissedTasks(
      tasks.filter(t => !t.recurring),
      now,
    ) as CronTask[]
    if (missed.length) {
      push({ type: 'missed', tasks: missed })
      await removeCronTasks(
        missed.map(t => t.id),
        opts.dir,
      )
    }

    let soonest: { task: LocalCronTask; at: number } | undefined
    const cfg = opts.getJitterConfig?.()
    for (const task of tasks) {
      const from = task.lastFiredAt ?? task.createdAt
      const at = task.recurring
        ? jitteredNextCronRunMs(task.cron, from, task.id, cfg)
        : oneShotJitteredNextCronRunMs(task.cron, from, task.id, cfg)
      if (at !== null && (!soonest || at < soonest.at)) soonest = { task, at }
    }
    nextFireTime = soonest?.at ?? null
    if (!soonest) return
    timer = setTimeout(async () => {
      push({ type: 'fire', task: soonest.task as CronTask })
      if (soonest.task.recurring) {
        await markCronTasksFired([soonest.task.id], Date.now(), opts.dir)
      } else {
        await removeCronTasks([soonest.task.id], opts.dir)
      }
      void schedule()
    }, Math.max(0, soonest.at - Date.now()))
  }

  opts.signal.addEventListener(
    'abort',
    () => {
      if (timer) clearTimeout(timer)
      while (waiters.length) waiters.shift()?.({ value: undefined, done: true })
    },
    { once: true },
  )
  void schedule()

  return {
    async *events() {
      while (!opts.signal.aborted) {
        const queued = queue.shift()
        if (queued) {
          yield queued
          continue
        }
        const next = await new Promise<IteratorResult<ScheduledTaskEvent>>(
          resolve => waiters.push(resolve),
        )
        if (next.done) return
        yield next.value
      }
    },
    getNextFireTime() {
      return nextFireTime
    },
  }
}

/**
 * Format missed one-shot tasks into a prompt that asks the model to confirm
 * with the user (via AskUserQuestion) before executing.
 * @internal
 */
export function buildMissedTaskNotification(missed: CronTask[]): string {
  const list = missed.map(t => `- ${t.prompt}`).join('\n')
  return `The following scheduled Chimera tasks were missed while the agent was offline:\n\n${list}\n\nAsk the user whether to run them now before taking action.`
}

/**
 * A user message typed on claude.ai, extracted from the bridge WS.
 * @internal
 */
export type InboundPrompt = {
  content: string | unknown[]
  uuid?: string
}

/**
 * Options for connectRemoteControl.
 * @internal
 */
export type ConnectRemoteControlOptions = {
  dir: string
  name?: string
  workerType?: string
  branch?: string
  gitRepoUrl?: string | null
  getAccessToken: () => string | undefined
  baseUrl: string
  orgUUID: string
  model: string
}

/**
 * Handle returned by connectRemoteControl. Write query() yields in,
 * read inbound prompts out. See src/assistant/daemonBridge.ts for full
 * field documentation.
 * @internal
 */
export type RemoteControlHandle = {
  sessionUrl: string
  environmentId: string
  bridgeSessionId: string
  write(msg: SDKMessage): void
  sendResult(): void
  sendControlRequest(req: unknown): void
  sendControlResponse(res: unknown): void
  sendControlCancelRequest(requestId: string): void
  inboundPrompts(): AsyncGenerator<InboundPrompt>
  controlRequests(): AsyncGenerator<unknown>
  permissionResponses(): AsyncGenerator<unknown>
  onStateChange(
    cb: (
      state: 'ready' | 'connected' | 'reconnecting' | 'failed',
      detail?: string,
    ) => void,
  ): void
  teardown(): Promise<void>
}

/**
 * Hold a claude.ai remote-control bridge connection from a daemon process.
 *
 * The daemon owns the WebSocket in the PARENT process — if the agent
 * subprocess (spawned via `query()`) crashes, the daemon respawns it while
 * claude.ai keeps the same session. Contrast with `query.enableRemoteControl`
 * which puts the WS in the CHILD process (dies with the agent).
 *
 * Pipe `query()` yields through `write()` + `sendResult()`. Read
 * `inboundPrompts()` (user typed on claude.ai) into `query()`'s input
 * stream. Handle `controlRequests()` locally (interrupt → abort, set_model
 * → reconfigure).
 *
 * Skips the `tengu_ccr_bridge` gate and policy-limits check — @internal
 * caller is pre-entitled. OAuth is still required (env var or keychain).
 *
 * Returns null on no-OAuth or registration failure.
 *
 * @internal
 */
export async function connectRemoteControl(
  _opts: ConnectRemoteControlOptions,
): Promise<RemoteControlHandle | null> {
  return null
}
