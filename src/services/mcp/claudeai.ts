import type { ScopedMcpServerConfig } from './types.js'

/**
 * Chimera is a local-first Codex harness. Cloud-managed Claude.ai MCP
 * connectors are intentionally disabled in publishable builds so startup never
 * fetches remote connector catalogs or forwards ChatGPT OAuth tokens to
 * Anthropic-owned infrastructure.
 */
export async function fetchClaudeAIMcpConfigsIfEligible(): Promise<
  Record<string, ScopedMcpServerConfig>
> {
  return {}
}

export function clearClaudeAIMcpConfigsCache(): void {}

export function markClaudeAiMcpConnected(_name: string): void {}

export const markChimeraAiMcpConnected = markClaudeAiMcpConnected

export function hasClaudeAiMcpEverConnected(_name: string): boolean {
  return false
}

export const hasChimeraAiMcpEverConnected = hasClaudeAiMcpEverConnected
