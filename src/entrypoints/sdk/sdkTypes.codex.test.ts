import { describe, expect, test } from 'bun:test'
import * as sdk from '../agentSdkTypes.js'

describe('SDK type surface', () => {
  test('exports runtime constants and constructors used by Chimera', () => {
    expect(sdk.HOOK_EVENTS).toContain('PreToolUse')
    expect(typeof sdk.query).toBe('function')
    expect(typeof sdk.tool).toBe('function')
    expect(typeof sdk.createSdkMcpServer).toBe('function')
  })
})
