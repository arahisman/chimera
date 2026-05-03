const ENABLED = new Set<string>(['TOOL_SEARCH', 'TREE_SITTER_BASH', 'VOICE_MODE'])

export function feature(name: string): boolean {
  const override =
    process.env[`CHIMERA_BUNDLE_FEATURE_${name}`] ??
    process.env[`CODEX_CODE_BUNDLE_FEATURE_${name}`]
  if (override === 'true') return true
  if (override === 'false') return false
  return ENABLED.has(name)
}
