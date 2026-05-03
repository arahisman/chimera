export type CacheEditsBlock = {
  type: 'cache_edits'
  edits: { type: 'delete'; cache_reference: string }[]
}

export type PinnedCacheEdits = {
  userMessageIndex: number
  block: CacheEditsBlock
}

export type CachedMCState = {
  registeredTools: Set<string>
  toolOrder: string[]
  toolMessageGroups: string[][]
  deletedRefs: Set<string>
  sentTools: Set<string>
  pinnedEdits: PinnedCacheEdits[]
}

export type CachedMCConfig = {
  enabled: boolean
  triggerThreshold: number
  keepRecent: number
  supportedModels: string[]
  systemPromptSuggestSummaries: boolean
}

const LOCAL_DISABLED_CONFIG: CachedMCConfig = {
  enabled: false,
  triggerThreshold: Number.POSITIVE_INFINITY,
  keepRecent: 8,
  supportedModels: [],
  systemPromptSuggestSummaries: false,
}

export function getCachedMCConfig(): CachedMCConfig {
  return LOCAL_DISABLED_CONFIG
}

export function isCachedMicrocompactEnabled(): boolean {
  return false
}

export function isModelSupportedForCacheEditing(_model: string): boolean {
  return false
}

export function createCachedMCState(): CachedMCState {
  return {
    registeredTools: new Set(),
    toolOrder: [],
    toolMessageGroups: [],
    deletedRefs: new Set(),
    sentTools: new Set(),
    pinnedEdits: [],
  }
}

export function registerToolResult(
  state: CachedMCState,
  toolUseId: string,
): void {
  if (state.registeredTools.has(toolUseId)) return
  state.registeredTools.add(toolUseId)
  state.toolOrder.push(toolUseId)
}

export function registerToolMessage(
  state: CachedMCState,
  toolUseIds: string[],
): void {
  if (toolUseIds.length > 0) {
    state.toolMessageGroups.push([...toolUseIds])
  }
}

export function getToolResultsToDelete(_state: CachedMCState): string[] {
  return []
}

export function createCacheEditsBlock(
  _state: CachedMCState,
  toolUseIds: string[],
): CacheEditsBlock | null {
  if (toolUseIds.length === 0) return null
  return {
    type: 'cache_edits',
    edits: toolUseIds.map(toolUseId => ({
      type: 'delete',
      cache_reference: toolUseId,
    })),
  }
}

export function markToolsSentToAPI(state: CachedMCState): void {
  for (const toolUseId of state.toolOrder) {
    state.sentTools.add(toolUseId)
  }
}

export function resetCachedMCState(state: CachedMCState): void {
  state.registeredTools.clear()
  state.toolOrder.length = 0
  state.toolMessageGroups.length = 0
  state.deletedRefs.clear()
  state.sentTools.clear()
  state.pinnedEdits.length = 0
}
