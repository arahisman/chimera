import type * as schemas from './coreSchemas.js'

type InferSchema<Name extends keyof typeof schemas> = any

export type ModelUsage = InferSchema<'ModelUsageSchema'>
export type OutputFormatType = InferSchema<'OutputFormatTypeSchema'>
export type BaseOutputFormat = InferSchema<'BaseOutputFormatSchema'>
export type JsonSchemaOutputFormat = InferSchema<'JsonSchemaOutputFormatSchema'>
export type OutputFormat = InferSchema<'OutputFormatSchema'>
export type ApiKeySource = InferSchema<'ApiKeySourceSchema'>
export type ConfigScope = InferSchema<'ConfigScopeSchema'>
export type SdkBeta = InferSchema<'SdkBetaSchema'>
export type ThinkingAdaptive = InferSchema<'ThinkingAdaptiveSchema'>
export type ThinkingEnabled = InferSchema<'ThinkingEnabledSchema'>
export type ThinkingDisabled = InferSchema<'ThinkingDisabledSchema'>
export type ThinkingConfig = InferSchema<'ThinkingConfigSchema'>
export type McpStdioServerConfig = InferSchema<'McpStdioServerConfigSchema'>
export type McpSSEServerConfig = InferSchema<'McpSSEServerConfigSchema'>
export type McpHttpServerConfig = InferSchema<'McpHttpServerConfigSchema'>
export type McpSdkServerConfig = InferSchema<'McpSdkServerConfigSchema'>
export type McpServerConfigForProcessTransport =
  InferSchema<'McpServerConfigForProcessTransportSchema'>
export type McpClaudeAIProxyServerConfig =
  InferSchema<'McpClaudeAIProxyServerConfigSchema'>
export type McpServerStatusConfig = InferSchema<'McpServerStatusConfigSchema'>
export type McpServerStatus = InferSchema<'McpServerStatusSchema'>
export type McpSetServersResult = InferSchema<'McpSetServersResultSchema'>
export type PermissionUpdateDestination =
  InferSchema<'PermissionUpdateDestinationSchema'>
export type PermissionBehavior = InferSchema<'PermissionBehaviorSchema'>
export type PermissionRuleValue = InferSchema<'PermissionRuleValueSchema'>
export type PermissionUpdate = InferSchema<'PermissionUpdateSchema'>
export type PermissionDecisionClassification =
  InferSchema<'PermissionDecisionClassificationSchema'>
export type PermissionResult = InferSchema<'PermissionResultSchema'>
export type PermissionMode = InferSchema<'PermissionModeSchema'>
export type HookEvent = InferSchema<'HookEventSchema'>
export type BaseHookInput = InferSchema<'BaseHookInputSchema'>
export type PreToolUseHookInput = InferSchema<'PreToolUseHookInputSchema'>
export type PermissionRequestHookInput =
  InferSchema<'PermissionRequestHookInputSchema'>
export type PostToolUseHookInput = InferSchema<'PostToolUseHookInputSchema'>
export type PostToolUseFailureHookInput =
  InferSchema<'PostToolUseFailureHookInputSchema'>
export type PermissionDeniedHookInput =
  InferSchema<'PermissionDeniedHookInputSchema'>
export type NotificationHookInput = InferSchema<'NotificationHookInputSchema'>
export type UserPromptSubmitHookInput =
  InferSchema<'UserPromptSubmitHookInputSchema'>
export type SessionStartHookInput = InferSchema<'SessionStartHookInputSchema'>
export type SetupHookInput = InferSchema<'SetupHookInputSchema'>
export type StopHookInput = InferSchema<'StopHookInputSchema'>
export type StopFailureHookInput = InferSchema<'StopFailureHookInputSchema'>
export type SubagentStartHookInput = InferSchema<'SubagentStartHookInputSchema'>
export type SubagentStopHookInput = InferSchema<'SubagentStopHookInputSchema'>
export type PreCompactHookInput = InferSchema<'PreCompactHookInputSchema'>
export type PostCompactHookInput = InferSchema<'PostCompactHookInputSchema'>
export type TeammateIdleHookInput = InferSchema<'TeammateIdleHookInputSchema'>
export type TaskCreatedHookInput = InferSchema<'TaskCreatedHookInputSchema'>
export type TaskCompletedHookInput = InferSchema<'TaskCompletedHookInputSchema'>
export type ElicitationHookInput = InferSchema<'ElicitationHookInputSchema'>
export type ElicitationResultHookInput =
  InferSchema<'ElicitationResultHookInputSchema'>
export type ConfigChangeHookInput = InferSchema<'ConfigChangeHookInputSchema'>
export type InstructionsLoadedHookInput =
  InferSchema<'InstructionsLoadedHookInputSchema'>
export type WorktreeCreateHookInput =
  InferSchema<'WorktreeCreateHookInputSchema'>
export type WorktreeRemoveHookInput =
  InferSchema<'WorktreeRemoveHookInputSchema'>
export type CwdChangedHookInput = InferSchema<'CwdChangedHookInputSchema'>
export type FileChangedHookInput = InferSchema<'FileChangedHookInputSchema'>
export type ExitReason = InferSchema<'ExitReasonSchema'>
export type SessionEndHookInput = InferSchema<'SessionEndHookInputSchema'>
export type HookInput = InferSchema<'HookInputSchema'>
export type AsyncHookJSONOutput = InferSchema<'AsyncHookJSONOutputSchema'>
export type PreToolUseHookSpecificOutput =
  InferSchema<'PreToolUseHookSpecificOutputSchema'>
export type UserPromptSubmitHookSpecificOutput =
  InferSchema<'UserPromptSubmitHookSpecificOutputSchema'>
export type SessionStartHookSpecificOutput =
  InferSchema<'SessionStartHookSpecificOutputSchema'>
export type SetupHookSpecificOutput =
  InferSchema<'SetupHookSpecificOutputSchema'>
export type SubagentStartHookSpecificOutput =
  InferSchema<'SubagentStartHookSpecificOutputSchema'>
export type PostToolUseHookSpecificOutput =
  InferSchema<'PostToolUseHookSpecificOutputSchema'>
export type PostToolUseFailureHookSpecificOutput =
  InferSchema<'PostToolUseFailureHookSpecificOutputSchema'>
export type PermissionDeniedHookSpecificOutput =
  InferSchema<'PermissionDeniedHookSpecificOutputSchema'>
export type NotificationHookSpecificOutput =
  InferSchema<'NotificationHookSpecificOutputSchema'>
export type PermissionRequestHookSpecificOutput =
  InferSchema<'PermissionRequestHookSpecificOutputSchema'>
export type CwdChangedHookSpecificOutput =
  InferSchema<'CwdChangedHookSpecificOutputSchema'>
export type FileChangedHookSpecificOutput =
  InferSchema<'FileChangedHookSpecificOutputSchema'>
export type SyncHookJSONOutput = InferSchema<'SyncHookJSONOutputSchema'>
export type ElicitationHookSpecificOutput =
  InferSchema<'ElicitationHookSpecificOutputSchema'>
export type ElicitationResultHookSpecificOutput =
  InferSchema<'ElicitationResultHookSpecificOutputSchema'>
export type WorktreeCreateHookSpecificOutput =
  InferSchema<'WorktreeCreateHookSpecificOutputSchema'>
export type HookJSONOutput = InferSchema<'HookJSONOutputSchema'>
export type PromptRequestOption = InferSchema<'PromptRequestOptionSchema'>
export type PromptRequest = InferSchema<'PromptRequestSchema'>
export type PromptResponse = InferSchema<'PromptResponseSchema'>
export type SlashCommand = InferSchema<'SlashCommandSchema'>
export type AgentInfo = InferSchema<'AgentInfoSchema'>
export type ModelInfo = InferSchema<'ModelInfoSchema'>
export type AccountInfo = InferSchema<'AccountInfoSchema'>
export type AgentMcpServerSpec = InferSchema<'AgentMcpServerSpecSchema'>
export type AgentDefinition = InferSchema<'AgentDefinitionSchema'>
export type SettingSource = InferSchema<'SettingSourceSchema'>
export type SdkPluginConfig = InferSchema<'SdkPluginConfigSchema'>
export type RewindFilesResult = InferSchema<'RewindFilesResultSchema'>
export type SDKAssistantMessageError =
  InferSchema<'SDKAssistantMessageErrorSchema'>
export type SDKStatus = InferSchema<'SDKStatusSchema'>
export type SDKUserMessage = InferSchema<'SDKUserMessageSchema'>
export type SDKUserMessageReplay = InferSchema<'SDKUserMessageReplaySchema'>
export type SDKRateLimitInfo = InferSchema<'SDKRateLimitInfoSchema'>
export type SDKAssistantMessage = InferSchema<'SDKAssistantMessageSchema'>
export type SDKRateLimitEvent = InferSchema<'SDKRateLimitEventSchema'>
export type SDKStreamlinedTextMessage =
  InferSchema<'SDKStreamlinedTextMessageSchema'>
export type SDKStreamlinedToolUseSummaryMessage =
  InferSchema<'SDKStreamlinedToolUseSummaryMessageSchema'>
export type SDKPermissionDenial = InferSchema<'SDKPermissionDenialSchema'>
export type SDKResultSuccess = InferSchema<'SDKResultSuccessSchema'>
export type SDKResultError = InferSchema<'SDKResultErrorSchema'>
export type SDKResultMessage = InferSchema<'SDKResultMessageSchema'>
export type SDKSystemMessage = InferSchema<'SDKSystemMessageSchema'>
export type SDKPartialAssistantMessage =
  InferSchema<'SDKPartialAssistantMessageSchema'>
export type SDKCompactBoundaryMessage =
  InferSchema<'SDKCompactBoundaryMessageSchema'>
export type SDKStatusMessage = InferSchema<'SDKStatusMessageSchema'>
export type SDKPostTurnSummaryMessage =
  InferSchema<'SDKPostTurnSummaryMessageSchema'>
export type SDKAPIRetryMessage = InferSchema<'SDKAPIRetryMessageSchema'>
export type SDKLocalCommandOutputMessage =
  InferSchema<'SDKLocalCommandOutputMessageSchema'>
export type SDKHookStartedMessage = InferSchema<'SDKHookStartedMessageSchema'>
export type SDKHookProgressMessage =
  InferSchema<'SDKHookProgressMessageSchema'>
export type SDKHookResponseMessage =
  InferSchema<'SDKHookResponseMessageSchema'>
export type SDKToolProgressMessage =
  InferSchema<'SDKToolProgressMessageSchema'>
export type SDKAuthStatusMessage = InferSchema<'SDKAuthStatusMessageSchema'>
export type SDKFilesPersistedEvent =
  InferSchema<'SDKFilesPersistedEventSchema'>
export type SDKTaskNotificationMessage =
  InferSchema<'SDKTaskNotificationMessageSchema'>
export type SDKTaskStartedMessage = InferSchema<'SDKTaskStartedMessageSchema'>
export type SDKSessionStateChangedMessage =
  InferSchema<'SDKSessionStateChangedMessageSchema'>
export type SDKTaskProgressMessage =
  InferSchema<'SDKTaskProgressMessageSchema'>
export type SDKToolUseSummaryMessage =
  InferSchema<'SDKToolUseSummaryMessageSchema'>
export type SDKElicitationCompleteMessage =
  InferSchema<'SDKElicitationCompleteMessageSchema'>
export type SDKPromptSuggestionMessage =
  InferSchema<'SDKPromptSuggestionMessageSchema'>
export type SDKSessionInfo = InferSchema<'SDKSessionInfoSchema'>
export type SDKMessage = InferSchema<'SDKMessageSchema'>
export type FastModeState = InferSchema<'FastModeStateSchema'>
