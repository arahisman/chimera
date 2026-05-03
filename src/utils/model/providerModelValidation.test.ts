import { describe, expect, test } from 'bun:test'
import { parseUserSpecifiedModel } from './model.js'
import { validateModel } from './validateModel.js'

describe('external provider model validation', () => {
  test('accepts known provider/model selections', async () => {
    await expect(validateModel('openrouter/anthropic/claude-sonnet-4.5'))
      .resolves.toEqual({ valid: true })
    await expect(validateModel('github-copilot/gpt-5.2-codex')).resolves.toEqual(
      { valid: true },
    )
  })

  test('does not treat legacy family aliases as external provider models', async () => {
    await expect(validateModel('sonnet')).resolves.toMatchObject({
      valid: false,
    })
  })

  test('preserves provider-local model casing after the provider id', () => {
    expect(parseUserSpecifiedModel('OpenRouter/Anthropic/Claude-Sonnet-4.5')).toBe(
      'openrouter/Anthropic/Claude-Sonnet-4.5',
    )
  })
})
