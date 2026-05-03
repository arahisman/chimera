import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

function readRuntimeSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8').split(
    '//# sourceMappingURL=',
  )[0]
}

describe('Codex import of legacy Chimera settings', () => {
  test('first-run onboarding offers an explicit import step', () => {
    const source = readRuntimeSource('src/components/Onboarding.tsx')

    expect(source).toContain('ChimeraSettingsImportStep')
    expect(source).toContain("id: 'settings-import'")
  })

  test('import code copies settings without copying Chimera auth or trust state', () => {
    const source = readRuntimeSource('src/utils/configImport.ts')

    expect(source).toContain('GLOBAL_CONFIG_KEYS')
    expect(source).toContain('claudeSettingsImportDecision')
    expect(source).toContain('settings.json')
    expect(source).toContain('IMPORTABLE_EXTENSION_DIRS')
    expect(source).toContain('commands')
    expect(source).toContain('agents')
    expect(source).toContain('skills')
    expect(source).toContain('output-styles')
    expect(source).toContain("join(getOriginalCwd(), '.claude')")
    expect(source).toContain("join(getOriginalCwd(), '.chimera')")
    expect(source).not.toContain('oauthAccount')
    expect(source).not.toContain('primaryApiKey')
    expect(source).not.toContain('projects')
  })
})
