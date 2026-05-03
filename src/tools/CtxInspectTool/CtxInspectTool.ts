import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { getStats, isContextCollapseEnabled } from '../../services/contextCollapse/index.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { jsonStringify } from '../../utils/slowOperations.js'

const inputSchema = lazySchema(() => z.strictObject({}))
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    enabled: z.boolean(),
    collapsedSpans: z.number(),
    stagedSpans: z.number(),
    collapsedMessages: z.number(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

type Output = z.infer<OutputSchema>

export const CtxInspectTool = buildTool({
  name: 'CtxInspect',
  searchHint: 'inspect context collapse status',
  maxResultSizeChars: 20_000,
  shouldDefer: true,
  isEnabled() {
    return isContextCollapseEnabled()
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  async description() {
    return 'Inspect local context-collapse status'
  },
  async prompt() {
    return 'Inspect the local context-collapse status.'
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
      content: jsonStringify(output),
    }
  },
  async call() {
    const stats = getStats()
    return {
      data: {
        enabled: isContextCollapseEnabled(),
        collapsedSpans: stats.collapsedSpans,
        stagedSpans: stats.stagedSpans,
        collapsedMessages: stats.collapsedMessages,
      },
    }
  },
} satisfies ToolDef<InputSchema, Output>)
