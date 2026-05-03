import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { SLEEP_TOOL_NAME } from './prompt.js'

export const SleepTool = buildTool({
  name: SLEEP_TOOL_NAME,
  async description() {
    return 'Wait for a specified duration.'
  },
  inputSchema: z.object({
    duration_ms: z.number().int().min(0).max(300_000).default(1000),
  }),
  async prompt() {
    return 'Wait for duration_ms milliseconds without spawning a shell.'
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  async *call(input) {
    await new Promise(resolve => setTimeout(resolve, input.duration_ms))
    return {
      resultForAssistant: `Slept for ${input.duration_ms}ms.`,
    }
  },
})

