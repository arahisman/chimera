import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Codex local auto-updater gate', () => {
  test('skips server-enforced minimum version for local Codex builds', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/utils/autoUpdater.ts'),
      'utf8',
    )

    expect(source).toContain("options.packageUrl === 'chimera'")
    expect(source).toContain("options.version.endsWith('-local')")
    expect(source).toContain('CHIMERA_SKIP_VERSION_CHECK')
    expect(source).toContain('Chimera')
    expect(source).toContain('chimera update')
    expect(source).not.toContain('claude update')
  })
})
