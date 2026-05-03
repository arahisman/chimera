import { describe, expect, test } from 'bun:test'
import { isCodexFeatureEnabled } from './featurePolicy.js'

describe('codex feature policy', () => {
  test('keeps core tools enabled', () => {
    expect(isCodexFeatureEnabled('bash')).toBe(true)
    expect(isCodexFeatureEnabled('file-edit')).toBe(true)
  })

  test('disables unrecovered native and private features', () => {
    expect(isCodexFeatureEnabled('computer-use')).toBe(false)
    expect(isCodexFeatureEnabled('claude-in-chrome')).toBe(false)
    expect(isCodexFeatureEnabled('coordinator')).toBe(false)
    expect(isCodexFeatureEnabled('remote-bridge')).toBe(false)
    expect(isCodexFeatureEnabled('web-search')).toBe(true)
  })

  test('allows explicit env overrides', () => {
    process.env.CHIMERA_FEATURE_WORKFLOW = 'true'
    try {
      expect(isCodexFeatureEnabled('workflow')).toBe(true)
    } finally {
      delete process.env.CHIMERA_FEATURE_WORKFLOW
    }
  })
})
