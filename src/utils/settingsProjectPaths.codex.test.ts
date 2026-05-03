import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

function readRuntimeSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8').split(
    '//# sourceMappingURL=',
  )[0]
}

describe('Chimera project settings paths', () => {
  test('project and local settings default to .chimera, not .claude', () => {
    const source = readRuntimeSource('src/utils/settings/settings.ts')

    expect(source).toContain("join('.chimera', 'settings.json')")
    expect(source).toContain("join('.chimera', 'settings.local.json')")
    expect(source).not.toContain("join('.claude', 'settings.json')")
    expect(source).not.toContain("join('.claude', 'settings.local.json')")
  })

  test('sandbox protects new Chimera settings and legacy Chimera settings', () => {
    const source = readRuntimeSource('src/utils/sandbox/sandbox-adapter.ts')

    expect(source).toContain("'.chimera'")
    expect(source).toContain("'.claude'")
    expect(source).toContain("'settings.json'")
    expect(source).toContain("'settings.local.json'")
  })

  test('legacy project settings are only used by explicit import code', () => {
    const settingsSource = readRuntimeSource('src/utils/settings/settings.ts')
    const importSource = readRuntimeSource('src/utils/configImport.ts')

    expect(settingsSource).not.toContain("join('.claude'")
    expect(importSource).toContain("join(getOriginalCwd(), '.claude'")
    expect(importSource).toContain('projectSettingsPath')
    expect(importSource).toContain('localSettingsPath')
  })

  test('project extension discovery uses .chimera as the active directory', () => {
    const markdownLoaderSource = readRuntimeSource(
      'src/utils/markdownConfigLoader.ts',
    )
    const skillsSource = readRuntimeSource('src/skills/loadSkillsDir.ts')

    expect(markdownLoaderSource).toContain(
      "CHIMERA_PROJECT_CONFIG_DIR = '.chimera'",
    )
    expect(skillsSource).toContain('CHIMERA_PROJECT_CONFIG_DIR')
    expect(skillsSource).not.toContain("join(dir, '.claude', 'skills')")
  })

  test('plugin manifests prefer .chimera-plugin while accepting legacy manifests', () => {
    const pluginManifestPathSource = readRuntimeSource(
      'src/utils/plugins/pluginManifestPaths.ts',
    )
    const pluginSmokeSource = readRuntimeSource(
      'scripts/smoke-codex-plugins.mjs',
    )

    expect(pluginManifestPathSource).toContain("'.chimera-plugin'")
    expect(pluginManifestPathSource).toContain("'.codex-plugin'")
    expect(pluginManifestPathSource).toContain("'.claude-plugin'")
    expect(pluginSmokeSource).toContain("'.chimera-plugin/plugin.json'")
    expect(pluginSmokeSource).not.toContain("'.claude-plugin/plugin.json'")
  })
})
