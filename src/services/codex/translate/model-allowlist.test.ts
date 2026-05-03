import { afterEach, describe, expect, test } from 'bun:test'
import {
  assertCodexModelAllowed,
  resolveCodexModel,
} from './model-allowlist.js'

const ORIGINAL_MODEL = process.env.CHIMERA_MODEL
const ORIGINAL_EXPERIMENTAL =
  process.env.CHIMERA_EXPERIMENTAL_MODEL_ALLOWLIST

afterEach(() => {
  setEnv('CHIMERA_MODEL', ORIGINAL_MODEL)
  setEnv('CHIMERA_EXPERIMENTAL_MODEL_ALLOWLIST', ORIGINAL_EXPERIMENTAL)
})

describe('codex model allowlist', () => {
  test('resolves real OpenAI model ids without aliasing', () => {
    delete process.env.CHIMERA_MODEL
    expect(resolveCodexModel(' GPT-5.5 ')).toBe('gpt-5.5')
    expect(resolveCodexModel('gpt-5.4')).toBe('gpt-5.4')
    expect(resolveCodexModel('gpt-5.4-mini')).toBe('gpt-5.4-mini')
    expect(resolveCodexModel('gpt-5.3-codex')).toBe('gpt-5.3-codex')
  })

  test('honors explicit model override', () => {
    process.env.CHIMERA_MODEL = 'gpt-5.4'
    expect(resolveCodexModel('gpt-5.5')).toBe('gpt-5.4')
    expect(() => assertCodexModelAllowed(resolveCodexModel('gpt-5.5'))).not.toThrow()
  })

  test('rejects Anthropic model aliases instead of mapping them', () => {
    delete process.env.CHIMERA_MODEL

    for (const model of ['sonnet', 'opus', 'haiku', 'claude-sonnet-4-6']) {
      expect(resolveCodexModel(model)).toBe(model)
      expect(() => assertCodexModelAllowed(resolveCodexModel(model))).toThrow(
        /Choose an OpenAI model/,
      )
    }
  })

  test('rejects unsupported explicit model override values', () => {
    process.env.CHIMERA_MODEL = 'sonnet'

    expect(resolveCodexModel('gpt-5.5')).toBe('sonnet')
    expect(() => assertCodexModelAllowed(resolveCodexModel('gpt-5.5'))).toThrow(
      /Choose an OpenAI model/,
    )
  })

  test('rejects unsupported models by default', () => {
    expect(() => assertCodexModelAllowed('gpt-6.0')).toThrow(
      /Choose an OpenAI model/,
    )
    expect(() => assertCodexModelAllowed('gpt-5.2')).toThrow(
      /Choose an OpenAI model/,
    )
    expect(() => assertCodexModelAllowed('gpt-5.3-codex-spark')).toThrow(
      /Choose an OpenAI model/,
    )
  })

  test('allows preview and future gpt models behind experimental gate', () => {
    process.env.CHIMERA_EXPERIMENTAL_MODEL_ALLOWLIST = 'true'
    expect(() => assertCodexModelAllowed('gpt-5.3-codex-spark')).not.toThrow()
    expect(() => assertCodexModelAllowed('gpt-6.0')).not.toThrow()
  })
})

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
