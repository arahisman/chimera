import { z } from 'zod/v4'
import type { Tool } from '../Tool.js'
import { getCwd } from '../utils/cwd.js'

const EmptyInputSchema = z.object({})

export function createLocalCapabilityTool(
  name: string,
  description: string,
  handler: () => Promise<string> | string,
): Tool<typeof EmptyInputSchema> {
  return {
    name,
    description: async () => description,
    inputSchema: EmptyInputSchema,
    isEnabled: () => true,
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    userFacingName: () => name,
    async prompt() {
      return description
    },
    async checkPermissions() {
      return { behavior: 'allow', updatedInput: {} }
    },
    async call() {
      const data = await handler()
      return {
        type: 'result',
        data,
        resultForAssistant: data,
      }
    },
    mapToolResultToToolResultBlockParam(data, toolUseID) {
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: String(data),
      }
    },
    renderToolUseMessage() {
      return null
    },
    renderToolResultMessage() {
      return null
    },
    toAutoClassifierInput() {
      return ''
    },
    maxResultSizeChars: 20_000,
  }
}

export function localCwdSummary(): string {
  return `cwd: ${getCwd()}`
}
