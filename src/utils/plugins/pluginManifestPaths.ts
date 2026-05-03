import { join } from 'path'
import { pathExists } from '../file.js'

export const CHIMERA_PLUGIN_MANIFEST_DIR = '.chimera-plugin'
export const LEGACY_CODEX_PLUGIN_MANIFEST_DIR = '.codex-plugin'
export const LEGACY_CLAUDE_PLUGIN_MANIFEST_DIR = '.claude-plugin'

export function getPluginMetadataFileCandidates(
  root: string,
  fileName: 'plugin.json' | 'marketplace.json',
): string[] {
  return [
    join(root, CHIMERA_PLUGIN_MANIFEST_DIR, fileName),
    join(root, LEGACY_CODEX_PLUGIN_MANIFEST_DIR, fileName),
    join(root, LEGACY_CLAUDE_PLUGIN_MANIFEST_DIR, fileName),
  ]
}

export async function findPluginMetadataFile(
  root: string,
  fileName: 'plugin.json' | 'marketplace.json',
): Promise<string> {
  for (const candidate of getPluginMetadataFileCandidates(root, fileName)) {
    if (await pathExists(candidate)) return candidate
  }
  return join(root, CHIMERA_PLUGIN_MANIFEST_DIR, fileName)
}
