import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

function readRuntimeSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8').split(
    '//# sourceMappingURL=',
  )[0]
}

describe('Codex context window wiring', () => {
  test('context decisions are backed by the Codex model registry', () => {
    const source = readRuntimeSource('src/utils/context.ts')

    expect(source).toContain('getCodexModelContextWindow')
    expect(source).toContain('getCodexModelMaxOutputTokens')
    expect(source.indexOf('getCodexModelContextWindow')).toBeLessThan(
      source.indexOf('has1mContext(model)'),
    )
  })

  test('Codex context test is part of the Codex test suite', () => {
    const packageJson = readRuntimeSource('package.json')

    expect(packageJson).toContain('src/utils/context.codex.test.ts')
  })

  test('auto-compact accepts Codex env overrides as primary names', () => {
    const source = readRuntimeSource('src/services/compact/autoCompact.ts')

    expect(source).toContain('CHIMERA_AUTO_COMPACT_WINDOW')
    expect(source).toContain('CODEX_AUTOCOMPACT_PCT_OVERRIDE')
    expect(source).toContain('CHIMERA_BLOCKING_LIMIT_OVERRIDE')
  })
})
