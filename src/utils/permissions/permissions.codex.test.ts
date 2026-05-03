import { describe, expect, test } from 'bun:test'
import { z } from 'zod/v4'
import { buildTool, type ToolUseContext } from '../../Tool.js'
import type { AppState } from '../../state/AppState.js'
import { hasPermissionsToUseTool } from './permissions.js'

const askTool = buildTool({
  name: 'WebSearch',
  inputSchema: z.strictObject({ query: z.string() }),
  async description() {
    return 'search the web'
  },
  async call() {
    return { data: {} }
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  async checkPermissions(input) {
    return {
      behavior: 'ask',
      updatedInput: input,
      message: 'WebSearchTool requires permission.',
    }
  },
})

describe('Chimera permission modes', () => {
  test('dontAsk approves permission prompts instead of denying autonomous tools', async () => {
    const decision = await hasPermissionsToUseTool(
      askTool,
      { query: 'Buy Me a Coffee Russia payout' },
      contextWithMode('dontAsk'),
      undefined,
      'toolu_web_search',
    )

    expect(decision).toMatchObject({
      behavior: 'allow',
      updatedInput: { query: 'Buy Me a Coffee Russia payout' },
      decisionReason: {
        type: 'mode',
        mode: 'dontAsk',
      },
    })
    expect('message' in decision ? decision.message : undefined).toBeUndefined()
  })

  test('dontAsk still respects explicit deny rules', async () => {
    const decision = await hasPermissionsToUseTool(
      askTool,
      { query: 'blocked' },
      contextWithMode('dontAsk', {
        alwaysDenyRules: {
          localSettings: ['WebSearch'],
        },
      }),
      undefined,
      'toolu_web_search',
    )

    expect(decision).toMatchObject({
      behavior: 'deny',
      decisionReason: {
        type: 'rule',
      },
    })
  })
})

function contextWithMode(
  mode: 'dontAsk',
  overrides: Partial<AppState['toolPermissionContext']> = {},
): ToolUseContext {
  const appState = {
    toolPermissionContext: {
      mode,
      additionalWorkingDirectories: new Map(),
      alwaysAllowRules: {},
      alwaysDenyRules: {},
      alwaysAskRules: {},
      isBypassPermissionsModeAvailable: false,
      ...overrides,
    },
  } as unknown as AppState

  return {
    abortController: new AbortController(),
    getAppState: () => appState,
    setAppState: () => {},
  } as unknown as ToolUseContext
}
