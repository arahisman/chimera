import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('codex system prompt identity', () => {
  test('uses Chimera identity while preserving tool discipline', () => {
    const forbiddenLegacyIdentity = `Anthropic's ${'off'}${'icial CLI'}`
    const systemSource = readFileSync(
      join(process.cwd(), 'src/constants/system.ts'),
      'utf8',
    )
    const promptSource = readFileSync(
      join(process.cwd(), 'src/constants/prompts.ts'),
      'utf8',
    )

    expect(systemSource).toContain(
      'You are Chimera, an interactive CLI for ChatGPT Codex.',
    )
    expect(`${systemSource}\n${promptSource}`).not.toContain(forbiddenLegacyIdentity)
    expect(promptSource).toContain(
      'Tools are executed in a user-selected permission mode.',
    )
    expect(promptSource).toContain(
      'Tool results may include data from external sources.',
    )
    expect(promptSource).toContain('SYSTEM_PROMPT_DYNAMIC_BOUNDARY')
    expect(promptSource).toContain(
      'The runtime provider is ChatGPT Codex via subscription OAuth.',
    )
    expect(promptSource).toContain('You are powered by the model named')
    expect(promptSource).toContain('Working directory:')
    expect(promptSource).toContain("Today's date:")
  })
})
