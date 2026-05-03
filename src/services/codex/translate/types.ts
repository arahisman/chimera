export type AnthropicTextBlock = {
  type: 'text'
  text: string
}

export type AnthropicImageBlock = {
  type: 'image'
  source:
    | { type: 'url'; url: string }
    | { type: 'base64'; media_type: string; data: string }
}

export type AnthropicDocumentBlock = {
  type: 'document'
  title?: string
  source:
    | { type: 'url'; url: string }
    | { type: 'base64'; media_type: string; data: string }
    | { type: 'text'; media_type?: string; data: string }
}

export type AnthropicToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input?: unknown
}

export type AnthropicToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  content: string | Array<AnthropicTextBlock | AnthropicImageBlock>
  is_error?: boolean
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicDocumentBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock

export type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

export type AnthropicTool = {
  name: string
  description?: string
  input_schema?: unknown
}

export type AnthropicRequest = {
  model: string
  system?: string | AnthropicTextBlock[]
  messages: AnthropicMessage[]
  tools?: AnthropicTool[]
  tool_choice?:
    | { type: 'auto' }
    | { type: 'none' }
    | { type: 'any' }
    | { type: 'tool'; name?: string }
  output_config?: {
    effort?: 'low' | 'medium' | 'high' | 'max'
    format?: {
      type: 'json_schema'
      name?: string
      schema: unknown
    }
  }
}

export type CodexLogger = {
  debug(message: string, metadata?: unknown): void
  warn(message: string, metadata?: unknown): void
  error(message: string, metadata?: unknown): void
}

export const noopCodexLogger: CodexLogger = {
  debug() {},
  warn() {},
  error() {},
}
