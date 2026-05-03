export type MessageBase = {
  uuid?: string
  timestamp?: string
  type: string
  message?: any
  content?: any
  [key: string]: any
}

export type UserMessage = MessageBase & { type: 'user' }
export type AssistantMessage = MessageBase & { type: 'assistant' }
export type SystemMessage = MessageBase & { type: 'system' }
export type AttachmentMessage = MessageBase & { type: 'attachment' }
export type ProgressMessage = MessageBase & { type: 'progress' }
export type HookResultMessage = MessageBase & { type: 'hook_result' }
export type SystemAPIErrorMessage = SystemMessage
export type SystemInformationalMessage = SystemMessage
export type SystemStopHookSummaryMessage = SystemMessage
export type SystemBridgeStatusMessage = SystemMessage
export type SystemTurnDurationMessage = SystemMessage
export type SystemThinkingMessage = SystemMessage
export type SystemMemorySavedMessage = SystemMessage
export type PartialCompactDirection = Record<string, any>
export type CollapsedReadSearchGroup = Record<string, any>
export type GroupedToolUseMessage = Record<string, any>
export type Message = MessageBase
export type NormalizedMessage = MessageBase
export type NormalizedUserMessage = UserMessage
export type NormalizedAssistantMessage = AssistantMessage
export type RenderableMessage = MessageBase
