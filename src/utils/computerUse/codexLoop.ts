import { randomUUID } from 'crypto'
import { postCodexResponses, type CodexResponse } from '../../services/codex/client.js'
import type {
  ResponsesInputItem,
  ResponsesRequest,
} from '../../services/codex/translate/request.js'
import { parseSseStream } from '../../services/codex/translate/sse.js'

export type ComputerUseEnvironment = 'browser' | 'mac' | 'windows' | 'ubuntu'

export type ComputerAction = {
  type: string
  [key: string]: unknown
}

export type ComputerCall = {
  callId: string
  actions: ComputerAction[]
}

export type ComputerScreenshot = {
  base64Png: string
  width: number
  height: number
}

export type LocalComputerUseTarget = {
  displayWidth: number
  displayHeight: number
  environment: ComputerUseEnvironment
  currentUrl?: () => string | undefined
  isAuthenticatedContext?: () => boolean
  captureScreenshot: () => Promise<ComputerScreenshot>
  executeActions: (actions: ComputerAction[]) => Promise<void>
}

export type ComputerUseSafetyPolicy = {
  allowedDomains?: string[]
  deniedDomains?: string[]
  allowAuthenticatedBrowser?: boolean
  approveActions?: (actions: ComputerAction[]) => Promise<boolean>
  redactScreenshot?: (screenshot: ComputerScreenshot) => Promise<ComputerScreenshot>
}

export type ComputerUseLoopOptions = {
  task: string
  model: string
  target: LocalComputerUseTarget
  safety?: ComputerUseSafetyPolicy
  maxTurns?: number
  sessionId?: string
  postResponses?: (
    body: ResponsesRequest,
    options?: { sessionId?: string; signal?: AbortSignal },
  ) => Promise<CodexResponse>
  signal?: AbortSignal
}

export type ComputerUseCollectedResponse = {
  responseId?: string
  text: string
  computerCalls: ComputerCall[]
}

export type ComputerUseLoopResult = {
  text: string
  turns: number
  responseId?: string
}

const COMPUTER_IMAGE_INCLUDE = 'computer_call_output.output.image_url'

export function buildInitialComputerUseRequest(input: {
  task: string
  model: string
  displayWidth: number
  displayHeight: number
  environment: ComputerUseEnvironment
}): ResponsesRequest {
  return {
    model: input.model,
    instructions:
      'Use the local computer tool only for the user-requested browser or sandbox task. Prefer safe, reversible actions.',
    input: [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: input.task }],
      },
    ],
    tools: [
      {
        type: 'computer',
        display_width: input.displayWidth,
        display_height: input.displayHeight,
        environment: input.environment,
      },
    ],
    tool_choice: 'auto',
    include: [COMPUTER_IMAGE_INCLUDE],
    store: false,
    stream: true,
    text: { verbosity: 'low' },
  }
}

export function buildComputerCallOutputItem(input: {
  callId: string
  screenshotBase64: string
}): ResponsesInputItem {
  return {
    type: 'computer_call_output',
    call_id: input.callId,
    output: {
      type: 'computer_screenshot',
      image_url: `data:image/png;base64,${input.screenshotBase64}`,
      detail: 'original',
    },
  }
}

export function buildComputerUseFollowupRequest(input: {
  model: string
  target: LocalComputerUseTarget
  previousResponseId?: string
  callId: string
  screenshotBase64: string
}): ResponsesRequest {
  return {
    model: input.model,
    previous_response_id: input.previousResponseId,
    input: [
      buildComputerCallOutputItem({
        callId: input.callId,
        screenshotBase64: input.screenshotBase64,
      }),
    ],
    tools: [
      {
        type: 'computer',
        display_width: input.target.displayWidth,
        display_height: input.target.displayHeight,
        environment: input.target.environment,
      },
    ],
    include: [COMPUTER_IMAGE_INCLUDE],
    store: false,
    stream: true,
    text: { verbosity: 'low' },
  }
}

export async function collectComputerUseResponse(
  body: ReadableStream<Uint8Array>,
): Promise<ComputerUseCollectedResponse> {
  const computerCalls: ComputerCall[] = []
  let text = ''
  let responseId: string | undefined

  for await (const event of parseSseStream(body)) {
    if (!event.data) continue
    let payload: any
    try {
      payload = JSON.parse(event.data)
    } catch {
      continue
    }
    if (payload.type === 'response.output_text.delta') {
      text += payload.delta ?? ''
      continue
    }
    if (payload.type === 'response.output_item.done') {
      const item = payload.item
      if (item?.type === 'computer_call') {
        computerCalls.push({
          callId: String(item.call_id ?? item.id ?? ''),
          actions: Array.isArray(item.actions) ? item.actions : [],
        })
      }
    }
    if (payload.type === 'response.completed') {
      responseId = payload.response?.id ?? responseId
    }
  }

  return { responseId, text, computerCalls }
}

export async function runCodexComputerUseLoop(
  options: ComputerUseLoopOptions,
): Promise<ComputerUseLoopResult> {
  const maxTurns = options.maxTurns ?? 12
  const postResponses = options.postResponses ?? postCodexResponses
  const sessionId = options.sessionId ?? `computer_use_${randomUUID()}`

  enforceTargetSafety(options.target, options.safety)

  let request: ResponsesRequest = buildInitialComputerUseRequest({
      task: options.task,
      model: options.model,
      displayWidth: options.target.displayWidth,
      displayHeight: options.target.displayHeight,
      environment: options.target.environment,
    })

  for (let turn = 1; turn <= maxTurns; turn++) {
    const response = await postResponses(request, {
      sessionId,
      signal: options.signal,
    })
    const collected = await collectComputerUseResponse(response.body)
    const computerCall = collected.computerCalls[0]
    if (!computerCall) {
      return {
        text: collected.text.trim(),
        turns: turn,
        responseId: collected.responseId,
      }
    }

    await enforceActionSafety(computerCall.actions, options.safety)
    await options.target.executeActions(computerCall.actions)
    const screenshot = await captureSafeScreenshot(options.target, options.safety)
    request = buildComputerUseFollowupRequest({
      model: options.model,
      target: options.target,
      previousResponseId: collected.responseId,
      callId: computerCall.callId,
      screenshotBase64: screenshot.base64Png,
    })
  }

  throw new Error(`Computer use exceeded maxTurns=${String(maxTurns)}`)
}

async function captureSafeScreenshot(
  target: LocalComputerUseTarget,
  safety: ComputerUseSafetyPolicy | undefined,
): Promise<ComputerScreenshot> {
  const screenshot = await target.captureScreenshot()
  return safety?.redactScreenshot
    ? safety.redactScreenshot(screenshot)
    : screenshot
}

function enforceTargetSafety(
  target: LocalComputerUseTarget,
  safety: ComputerUseSafetyPolicy | undefined,
): void {
  if (
    target.isAuthenticatedContext?.() &&
    safety?.allowAuthenticatedBrowser !== true
  ) {
    throw new Error('Computer use refuses authenticated browser contexts by default')
  }

  const currentUrl = target.currentUrl?.()
  if (!currentUrl) return
  const host = new URL(currentUrl).hostname
  const denied = new Set((safety?.deniedDomains ?? []).map(normalizeDomain))
  const allowed = new Set((safety?.allowedDomains ?? []).map(normalizeDomain))
  if (denied.has(host)) {
    throw new Error(`Computer use denied domain: ${host}`)
  }
  if (allowed.size > 0 && !allowed.has(host)) {
    throw new Error(`Computer use domain is not allow-listed: ${host}`)
  }
}

async function enforceActionSafety(
  actions: ComputerAction[],
  safety: ComputerUseSafetyPolicy | undefined,
): Promise<void> {
  if (!actions.some(isRiskyAction)) return
  const approved = await safety?.approveActions?.(actions)
  if (approved !== true) {
    throw new Error('Computer use action was not approved')
  }
}

function isRiskyAction(action: ComputerAction): boolean {
  return !['screenshot', 'wait'].includes(action.type)
}

function normalizeDomain(domain: string): string {
  return domain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}
