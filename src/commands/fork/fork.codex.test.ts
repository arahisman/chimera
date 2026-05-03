import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('fork command', () => {
  test('uses the local session fork implementation', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/commands/fork/index.ts'),
      'utf8',
    )

    expect(source).toContain('forkSession')
    expect(source).toContain('getSessionId')
    expect(source).not.toContain('localStatus')
    expect(source).not.toContain('LocalUnavailable')
  })
})
