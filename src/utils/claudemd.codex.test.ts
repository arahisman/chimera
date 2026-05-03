import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Codex memory file compatibility', () => {
  test('treats AGENTS.md as a project instruction file alongside CLAUDE.md', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/utils/claudemd.ts'),
      'utf8',
    )

    expect(source).toContain("'AGENTS.md'")
    expect(source).toContain("name === 'CLAUDE.md'")
    expect(source).toContain("name === 'AGENTS.md'")
  })
})
