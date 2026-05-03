export type CodexFeature =
  | 'agent'
  | 'bash'
  | 'file-read'
  | 'file-edit'
  | 'file-write'
  | 'glob'
  | 'grep'
  | 'mcp'
  | 'lsp'
  | 'todo'
  | 'skills'
  | 'web-fetch'
  | 'web-search'
  | 'claude-in-chrome'
  | 'computer-use'
  | 'coordinator'
  | 'remote-bridge'
  | 'proactive'
  | 'workflow'
  | 'voice-native'
  | 'deeplink-native'

const DEFAULTS: Record<CodexFeature, boolean> = {
  agent: true,
  bash: true,
  'file-read': true,
  'file-edit': true,
  'file-write': true,
  glob: true,
  grep: true,
  mcp: true,
  lsp: true,
  todo: true,
  skills: true,
  'web-fetch': true,
  'web-search': true,
  'claude-in-chrome': false,
  'computer-use': false,
  coordinator: false,
  'remote-bridge': false,
  proactive: false,
  workflow: false,
  'voice-native': false,
  'deeplink-native': false,
}

export function isCodexFeatureEnabled(feature: CodexFeature): boolean {
  const suffix = feature.toUpperCase().replace(/-/g, '_')
  const override =
    process.env[`CHIMERA_FEATURE_${suffix}`] ??
    process.env[`CODEX_CODE_FEATURE_${suffix}`]
  if (override === '1' || override === 'true') return true
  if (override === '0' || override === 'false') return false
  return DEFAULTS[feature]
}
