import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { DESCRIPTION, SNIP_TOOL_NAME } from './prompt.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    start_id: z.string().optional(),
    end_id: z.string().optional(),
    reason: z.string().optional(),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    enabled: z.boolean(),
    message: z.string(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

type Output = z.infer<OutputSchema>

export const SnipTool = buildTool({
  name: SNIP_TOOL_NAME,
  searchHint: 'trim obsolete conversation history',
  maxResultSizeChars: 10_000,
  shouldDefer: true,
  strict: true,
  isEnabled() {
    return false
  },
  isConcurrencySafe() {
    return true
  },
  async description() {
    return 'Trim obsolete conversation history'
  },
  async prompt() {
    return DESCRIPTION
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  renderToolUseMessage() {
    return null
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.message,
    }
  },
  async call() {
    return {
      data: {
        enabled: false,
        message:
          'Snip is disabled in this local Codex build. Use /compact for supported context reduction.',
      },
    }
  },
} satisfies ToolDef<InputSchema, Output>)
