import {
  assertCodexModelAllowed,
  resolveCodexModel,
} from './model-allowlist.js'
import type {
  AnthropicContentBlock,
  AnthropicDocumentBlock,
  AnthropicImageBlock,
  AnthropicMessage,
  AnthropicRequest,
  AnthropicTextBlock,
  AnthropicTool,
} from './types.js'

export type Effort = 'none' | 'low' | 'medium' | 'high' | 'xhigh'

export interface ResponsesRequest {
  model: string
  instructions?: string
  input: ResponsesInputItem[]
  tools?: ResponsesTool[]
  tool_choice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'function'; name: string }
  parallel_tool_calls?: boolean
  reasoning?: { effort?: Effort; summary?: unknown }
  store: false
  stream: true
  include?: string[]
  previous_response_id?: string
  service_tier?: string
  prompt_cache_key?: string
  text?: {
    verbosity?: 'low' | 'medium' | 'high'
    format?:
      | { type: 'text' }
      | { type: 'json_object' }
      | { type: 'json_schema'; name: string; schema: unknown; strict?: boolean }
  }
  client_metadata?: Record<string, string>
}

export type ResponsesInputItem =
  | {
      type: 'message'
      role: 'user' | 'assistant' | 'developer' | 'system'
      content: ResponsesContentPart[]
    }
  | {
      type: 'function_call'
      call_id: string
      name: string
      arguments: string
    }
  | {
      type: 'function_call_output'
      call_id: string
      output: string
    }
  | {
      type: 'computer_call_output'
      call_id: string
      output: {
        type: 'computer_screenshot'
        image_url: string
        detail?: 'original' | 'high' | 'low' | 'auto'
      }
    }

export type ResponsesContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'output_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | {
      type: 'input_file'
      filename?: string
      file_data?: string
      file_url?: string
    }

export type ResponsesTool =
  | ResponsesFunctionTool
  | ResponsesWebSearchTool
  | ResponsesComputerTool

export interface ResponsesFunctionTool {
  type: 'function'
  name: string
  description?: string
  parameters: unknown
  strict?: boolean
}

export interface ResponsesWebSearchTool {
  type: 'web_search'
  filters?: {
    allowed_domains?: string[]
    blocked_domains?: string[]
  }
  external_web_access?: boolean
}

export interface ResponsesComputerTool {
  type: 'computer'
  display_width: number
  display_height: number
  environment?: 'browser' | 'mac' | 'windows' | 'ubuntu'
}

export interface TranslateOptions {
  sessionId?: string
}

const VALID_EFFORTS = new Set<Effort>([
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
])
const ANTHROPIC_EFFORTS = new Set(['low', 'medium', 'high', 'max'])

export function translateRequest(
  req: AnthropicRequest,
  opts: TranslateOptions = {},
): ResponsesRequest {
  const model = resolveCodexModel(req.model)
  assertCodexModelAllowed(model)

  const instructions = buildInstructions(req.system)
  const input = buildInput(req.messages)
  const tools = req.tools?.map(toResponsesTool)
  const text: ResponsesRequest['text'] = { verbosity: 'low' }
  const fmt = req.output_config?.format
  if (fmt?.type === 'json_schema') {
    text.format = {
      type: 'json_schema',
      name: fmt.name ?? 'response',
      schema: fmt.schema,
      strict: true,
    }
  }

  const out: ResponsesRequest = {
    model,
    input,
    store: false,
    stream: true,
    parallel_tool_calls: true,
    tool_choice: mapToolChoice(req.tool_choice),
    text,
  }
  if (instructions) out.instructions = instructions
  if (tools?.length) out.tools = tools
  if (opts.sessionId) out.prompt_cache_key = opts.sessionId

  assertValidEffort(req.output_config?.effort)
  const effort = resolveEffort(toCodexEffort(req.output_config?.effort))
  if (effort) {
    out.reasoning = { effort }
    out.include = ['reasoning.encrypted_content']
  }
  return out
}

function mapToolChoice(
  choice: AnthropicRequest['tool_choice'],
): ResponsesRequest['tool_choice'] {
  if (!choice) return 'auto'
  switch (choice.type) {
    case 'auto':
      return 'auto'
    case 'none':
      return 'none'
    case 'any':
      return 'required'
    case 'tool':
      return choice.name ? { type: 'function', name: choice.name } : 'required'
  }
}

export function buildInstructions(
  system: AnthropicRequest['system'],
): string | undefined {
  if (!system) return undefined
  const blocks: AnthropicTextBlock[] =
    typeof system === 'string' ? [{ type: 'text', text: system }] : system
  const texts = blocks
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .filter(text => !text.startsWith('x-anthropic-billing-header:'))
  return texts.length ? texts.join('\n\n') : undefined
}

export function normalizeContent(
  content: AnthropicMessage['content'],
): AnthropicContentBlock[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return content
}

function buildInput(messages: AnthropicMessage[]): ResponsesInputItem[] {
  const out: ResponsesInputItem[] = []
  for (const msg of messages) {
    const blocks = normalizeContent(msg.content)
    if (msg.role === 'user') {
      const parts: ResponsesContentPart[] = []
      for (const block of blocks) {
        if (block.type === 'text') {
          parts.push({ type: 'input_text', text: block.text })
        } else if (block.type === 'image') {
          parts.push({ type: 'input_image', image_url: imageToUrl(block) })
        } else if (block.type === 'document') {
          parts.push(documentToPart(block))
        } else if (block.type === 'tool_result') {
          if (parts.length) {
            out.push({ type: 'message', role: 'user', content: parts.splice(0) })
          }
          const body = toolResultToString(block.content)
          out.push({
            type: 'function_call_output',
            call_id: block.tool_use_id,
            output: block.is_error ? `[tool execution error]\n${body}` : body,
          })
        }
      }
      if (parts.length) out.push({ type: 'message', role: 'user', content: parts })
      continue
    }

    const textParts: ResponsesContentPart[] = []
    const flushText = () => {
      if (textParts.length) {
        out.push({ type: 'message', role: 'assistant', content: textParts.splice(0) })
      }
    }
    for (const block of blocks) {
      if (block.type === 'text') {
        textParts.push({ type: 'output_text', text: block.text })
      } else if (block.type === 'tool_use') {
        flushText()
        out.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        })
      }
    }
    flushText()
  }
  return out
}

function imageToUrl(block: AnthropicImageBlock): string {
  if (!isObject(block.source) || typeof block.source.type !== 'string') {
    return 'data:application/octet-stream;base64,'
  }
  if (block.source.type === 'url') return block.source.url
  return `data:${block.source.media_type};base64,${block.source.data}`
}

function documentToPart(block: AnthropicDocumentBlock): ResponsesContentPart {
  if (!isObject(block.source) || typeof block.source.type !== 'string') {
    return {
      type: 'input_text',
      text: `[document attachment: ${block.title ?? 'untitled'}]`,
    }
  }
  if (block.source.type === 'url') {
    return { type: 'input_file', filename: block.title, file_url: block.source.url }
  }
  if (block.source.type === 'text') {
    const title = block.title ? `Document: ${block.title}\n\n` : ''
    return { type: 'input_text', text: `${title}${block.source.data}` }
  }
  return {
    type: 'input_file',
    filename: block.title,
    file_data: `data:${block.source.media_type};base64,${block.source.data}`,
  }
}

export function toolResultToString(
  content: string | Array<AnthropicTextBlock | AnthropicImageBlock | AnthropicDocumentBlock>,
): string {
  if (typeof content === 'string') return content
  return content
    .map(block => {
      if (block.type === 'text') return block.text
      if (block.type === 'document') {
        if (isObject(block.source) && block.source.type === 'text') {
          return block.source.data
        }
        return `[document omitted: ${block.title ?? 'untitled'}]`
      }
      if (!isObject(block.source) || typeof block.source.type !== 'string') {
        return '[attachment omitted]'
      }
      const mediaType = block.source.type === 'base64' ? block.source.media_type : 'url'
      return `[image omitted: ${mediaType}]`
    })
    .join('\n')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toResponsesTool(tool: AnthropicTool): ResponsesTool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema ?? {},
  }
}

function assertValidEffort(effort: unknown): void {
  if (effort !== undefined && !ANTHROPIC_EFFORTS.has(effort as string)) {
    throw new Error(
      `Invalid output_config.effort: "${effort}". Must be one of: ${Array.from(
        ANTHROPIC_EFFORTS,
      ).join(', ')}`,
    )
  }
}

function toCodexEffort(
  effort: NonNullable<AnthropicRequest['output_config']>['effort'],
): Effort | undefined {
  if (effort === 'max') return 'xhigh'
  return effort
}

function resolveEffort(effort?: Effort): Effort | undefined {
  const override = (
    process.env.CHIMERA_REASONING_EFFORT ??
    process.env.CODEX_CODE_REASONING_EFFORT
  )?.trim()
  if (!override) return effort
  if (!VALID_EFFORTS.has(override as Effort)) {
    throw new Error(
      `Invalid effort override: "${override}". Must be one of: ${Array.from(
        VALID_EFFORTS,
      ).join(', ')}`,
    )
  }
  return override as Effort
}
