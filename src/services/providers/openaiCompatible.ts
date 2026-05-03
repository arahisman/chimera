import OpenAI from 'openai'
import type {
  BetaMessage,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions.mjs'
import { randomUUID } from 'crypto'
import {
  getProviderInfo,
  parseProviderModel,
  type ExternalProviderConfig,
} from './catalog.js'
import {
  normalizeContent,
  toolResultToString,
} from '../codex/translate/request.js'
import type {
  AnthropicContentBlock,
  AnthropicImageBlock,
  AnthropicRequest,
} from '../codex/translate/types.js'
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'

export type ExternalProviderConnection = {
  providerId: string
  providerName: string
  modelId: string
  apiKey: string
  baseURL: string | undefined
}

export type ResolveExternalProviderConnectionOptions = {
  env?: Record<string, string | undefined>
  providerConfig?: Record<string, ExternalProviderConfig>
}

const PROVIDER_OPENAI_COMPATIBLE_BASE_URLS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  xai: 'https://api.x.ai/v1',
}

const PROVIDERS_WITH_OPENAI_DEFAULT_URL = new Set(['openai'])

export function resolveExternalProviderConnection(
  model: string,
  options: ResolveExternalProviderConnectionOptions = {},
): ExternalProviderConnection {
  const selection = parseProviderModel(model)
  if (!selection) {
    throw new Error(`Model "${model}" is not an external provider selection`)
  }

  const provider = getProviderInfo(selection.providerId)
  if (!provider) {
    throw new Error(`Unknown provider "${selection.providerId}"`)
  }

  const providerConfig = options.providerConfig?.[selection.providerId]
  const providerOptions = providerConfig?.options ?? {}
  const baseURL = stringOption(providerOptions.baseURL) ??
    provider.api ??
    PROVIDER_OPENAI_COMPATIBLE_BASE_URLS[provider.id]

  if (!baseURL && !PROVIDERS_WITH_OPENAI_DEFAULT_URL.has(provider.id)) {
    throw new Error(
      `Provider "${provider.name}" does not expose an OpenAI-compatible endpoint yet`,
    )
  }

  const env = options.env ?? process.env
  const apiKey = stringOption(providerOptions.apiKey) ??
    firstEnvValue(provider.env, env) ??
    (provider.id === 'lmstudio' ? 'lmstudio' : undefined)

  if (!apiKey) {
    throw new Error(
      `Provider "${provider.name}" is missing credentials. Set ${provider.env.join(' or ')} or configure provider.${provider.id}.options.apiKey.`,
    )
  }

  return {
    providerId: provider.id,
    providerName: provider.name,
    modelId: selection.modelId,
    apiKey,
    baseURL,
  }
}

export async function* queryOpenAICompatibleProvider(
  req: AnthropicRequest,
  options: { signal: AbortSignal },
): AsyncGenerator<BetaRawMessageStreamEvent> {
  const { client, connection } = createProviderClient(req.model)

  const messageId = `msg_${randomUUID()}`
  yield messageStart(messageId, req.model)

  const stream = await client.chat.completions.create(
    {
      model: connection.modelId,
      messages: toChatMessages(req),
      tools: req.tools?.map(toChatTool),
      tool_choice: toChatToolChoice(req.tool_choice),
      stream: true,
    },
    { signal: options.signal },
  )

  let textStarted = false
  let textStopped = false
  const toolBlockByIndex = new Map<number, number>()
  const toolArgsByIndex = new Map<number, string>()
  let nextBlockIndex = 0
  let stopReason: 'end_turn' | 'max_tokens' | 'tool_use' = 'end_turn'

  for await (const chunk of stream) {
    const choice = chunk.choices[0]
    const delta = choice?.delta
    const text = delta?.content
    if (text) {
      if (!textStarted) {
        textStarted = true
        yield contentBlockStart(nextBlockIndex, { type: 'text', text: '' })
      }
      yield {
        type: 'content_block_delta',
        index: nextBlockIndex,
        delta: { type: 'text_delta', text },
      } as BetaRawMessageStreamEvent
    }

    for (const toolCall of delta?.tool_calls ?? []) {
      const toolCallIndex = toolCall.index ?? 0
      let blockIndex = toolBlockByIndex.get(toolCallIndex)
      if (blockIndex === undefined) {
        if (textStarted && !textStopped) {
          yield contentBlockStop(nextBlockIndex)
          textStopped = true
          nextBlockIndex++
        }
        blockIndex = nextBlockIndex++
        toolBlockByIndex.set(toolCallIndex, blockIndex)
        toolArgsByIndex.set(toolCallIndex, '')
        yield contentBlockStart(blockIndex, {
          type: 'tool_use',
          id: toolCall.id ?? `toolu_${randomUUID()}`,
          name: toolCall.function?.name ?? 'tool',
          input: {},
        })
      }

      const partialJson = toolCall.function?.arguments
      if (partialJson) {
        toolArgsByIndex.set(
          toolCallIndex,
          `${toolArgsByIndex.get(toolCallIndex) ?? ''}${partialJson}`,
        )
        yield {
          type: 'content_block_delta',
          index: blockIndex,
          delta: { type: 'input_json_delta', partial_json: partialJson },
        } as BetaRawMessageStreamEvent
      }
    }

    if (choice?.finish_reason) {
      stopReason = mapFinishReason(choice.finish_reason)
    }
  }

  if (textStarted && !textStopped) {
    yield contentBlockStop(nextBlockIndex)
  }
  for (const blockIndex of toolBlockByIndex.values()) {
    yield contentBlockStop(blockIndex)
  }

  yield {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  } as BetaRawMessageStreamEvent
  yield { type: 'message_stop' } as BetaRawMessageStreamEvent
}

export async function queryOpenAICompatibleProviderOnce(
  req: AnthropicRequest,
  options: { signal: AbortSignal },
): Promise<BetaMessage> {
  const { client, connection } = createProviderClient(req.model)
  const completion = await client.chat.completions.create(
    {
      model: connection.modelId,
      messages: toChatMessages(req),
      tools: req.tools?.map(toChatTool),
      tool_choice: toChatToolChoice(req.tool_choice),
      stream: false,
    },
    { signal: options.signal },
  )

  return chatCompletionToAnthropicMessage(completion, req.model)
}

function createProviderClient(model: string): {
  client: OpenAI
  connection: ExternalProviderConnection
} {
  const settings = getSettings_DEPRECATED() || {}
  const connection = resolveExternalProviderConnection(model, {
    providerConfig: settings.provider,
  })
  const client = new OpenAI({
    apiKey: connection.apiKey,
    baseURL: connection.baseURL,
  })
  return { client, connection }
}

function toChatMessages(req: AnthropicRequest): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = []
  const system = systemToString(req.system)
  if (system) messages.push({ role: 'system', content: system })

  for (const message of req.messages) {
    const blocks = normalizeContent(message.content)
    if (message.role === 'user') {
      const parts = userBlocksToContent(blocks)
      if (typeof parts === 'string' || parts.length) {
        messages.push({ role: 'user', content: parts })
      }
      continue
    }

    const text = blocks
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
    const toolCalls = blocks
      .filter(block => block.type === 'tool_use')
      .map(block => ({
        id: block.id,
        type: 'function' as const,
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      }))
    messages.push({
      role: 'assistant',
      content: text || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    })
  }
  return messages
}

function userBlocksToContent(blocks: AnthropicContentBlock[]) {
  const parts: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = []
  for (const block of blocks) {
    if (block.type === 'text') {
      parts.push({ type: 'text', text: block.text })
    } else if (block.type === 'image') {
      parts.push({ type: 'image_url', image_url: { url: imageUrl(block) } })
    } else if (block.type === 'document') {
      const source = isObject(block.source) ? block.source : undefined
      parts.push({
        type: 'text',
        text:
          source?.type === 'text' && typeof source.data === 'string'
            ? source.data
            : `[document attachment: ${block.title ?? 'untitled'}]`,
      })
    } else if (block.type === 'tool_result') {
      parts.push({
        type: 'text',
        text: `Tool result ${block.tool_use_id}:\n${toolResultToString(block.content)}`,
      })
    }
  }
  return parts.length === 1 && parts[0]?.type === 'text' ? parts[0].text : parts
}

function systemToString(system: AnthropicRequest['system']): string | undefined {
  if (!system) return undefined
  if (typeof system === 'string') return system
  const text = system
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n\n')
  return text || undefined
}

function toChatTool(tool: NonNullable<AnthropicRequest['tools']>[number]): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema ?? { type: 'object', properties: {} },
    },
  }
}

function toChatToolChoice(
  choice: AnthropicRequest['tool_choice'],
):
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } }
  | undefined {
  if (!choice) return 'auto'
  switch (choice.type) {
    case 'auto':
      return 'auto'
    case 'none':
      return 'none'
    case 'any':
      return 'required'
    case 'tool':
      return choice.name
        ? { type: 'function', function: { name: choice.name } }
        : 'required'
  }
}

function messageStart(
  id: string,
  model: string,
): BetaRawMessageStreamEvent {
  return {
    type: 'message_start',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  } as BetaRawMessageStreamEvent
}

function contentBlockStart(
  index: number,
  contentBlock: unknown,
): BetaRawMessageStreamEvent {
  return {
    type: 'content_block_start',
    index,
    content_block: contentBlock,
  } as BetaRawMessageStreamEvent
}

function contentBlockStop(index: number): BetaRawMessageStreamEvent {
  return { type: 'content_block_stop', index } as BetaRawMessageStreamEvent
}

function imageUrl(block: AnthropicImageBlock): string {
  if (!isObject(block.source) || typeof block.source.type !== 'string') {
    return 'data:application/octet-stream;base64,'
  }
  if (block.source.type === 'url') return block.source.url
  return `data:${block.source.media_type};base64,${block.source.data}`
}

function mapFinishReason(
  reason: string,
): 'end_turn' | 'max_tokens' | 'tool_use' {
  if (reason === 'length') return 'max_tokens'
  if (reason === 'tool_calls' || reason === 'function_call') return 'tool_use'
  return 'end_turn'
}

export function chatCompletionToAnthropicMessage(
  completion: ChatCompletion,
  model: string,
): BetaMessage {
  const choice = completion.choices[0]
  const message = choice?.message
  const content: unknown[] = []

  const text = message?.content
  if (typeof text === 'string' && text.length > 0) {
    content.push({ type: 'text', text })
  }

  for (const toolCall of message?.tool_calls ?? []) {
    content.push({
      type: 'tool_use',
      id: toolCall.id,
      name: toolCall.function.name,
      input: parseToolArguments(toolCall.function.arguments),
    })
  }

  return {
    id: completion.id || `msg_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: mapFinishReason(choice?.finish_reason ?? 'stop'),
    stop_sequence: null,
    usage: {
      input_tokens: completion.usage?.prompt_tokens ?? 0,
      output_tokens: completion.usage?.completion_tokens ?? 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  } as BetaMessage
}

function parseToolArguments(args: string | undefined): unknown {
  if (!args) return {}
  try {
    return JSON.parse(args)
  } catch {
    return {}
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function firstEnvValue(
  names: readonly string[],
  env: Record<string, string | undefined>,
): string | undefined {
  for (const name of names) {
    const value = env[name]
    if (value) return value
  }
  return undefined
}

function stringOption(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
