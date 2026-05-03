import { describe, expect, test } from 'bun:test'
import { getRuntimeAPIProvider } from './providerMode.js'

describe('Codex-only runtime provider', () => {
  test('always runs as Codex', () => {
    expect(getRuntimeAPIProvider()).toBe('codex')
  })
})
