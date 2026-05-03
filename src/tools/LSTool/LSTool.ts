import { z } from 'zod/v4'
import { join } from 'path'
import { buildTool } from '../../Tool.js'
import {
  FILE_NOT_FOUND_CWD_NOTE,
  suggestPathUnderCwd,
} from '../../utils/file.js'
import { getFsImplementation } from '../../utils/fsOperations.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { expandPath } from '../../utils/path.js'
import { checkReadPermissionForTool } from '../../utils/permissions/filesystem.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { matchWildcardPattern } from '../../utils/permissions/shellRuleMatching.js'

export const LS_TOOL_NAME = 'LS'

const inputSchema = lazySchema(() =>
  z.strictObject({
    path: z
      .string()
      .describe('The absolute path to the directory to list'),
    ignore: z
      .array(z.string())
      .optional()
      .describe('Optional glob patterns or entry names to exclude'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const entrySchema = lazySchema(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['file', 'directory', 'symlink', 'other']),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    path: z.string(),
    entries: z.array(entrySchema()),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

export const LSTool = buildTool({
  name: LS_TOOL_NAME,
  aliases: ['Ls'],
  searchHint: 'list directory entries',
  maxResultSizeChars: 100_000,
  strict: true,
  async description() {
    return 'Lists files and directories in a local directory'
  },
  async prompt() {
    return `Lists files and directories in a local directory.

Usage:
- The path parameter must be an absolute path to a directory.
- Use ignore to hide specific entries or glob-style patterns.
- Prefer Glob or Grep when searching recursively.`
  },
  userFacingName() {
    return 'LS'
  },
  getToolUseSummary(input) {
    return input?.path ?? null
  },
  getActivityDescription(input) {
    return input?.path ? `Listing ${input.path}` : 'Listing directory'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  isSearchOrReadCommand() {
    return { isSearch: false, isRead: true, isList: true }
  },
  getPath(input): string {
    return input.path
  },
  backfillObservableInput(input) {
    if (typeof input.path === 'string') {
      input.path = expandPath(input.path)
    }
  },
  async preparePermissionMatcher({ path }) {
    return pattern => matchWildcardPattern(pattern, path)
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    return checkReadPermissionForTool(
      LSTool,
      input,
      appState.toolPermissionContext,
    )
  },
  toAutoClassifierInput(input) {
    return input.path
  },
  renderToolUseMessage(input) {
    return `LS(${input.path ?? 'directory'})`
  },
  renderToolResultMessage(output) {
    return renderEntries(output)
  },
  renderToolUseErrorMessage(content) {
    return String(content)
  },
  async validateInput({ path }) {
    const fullPath = expandPath(path)
    if (fullPath.startsWith('\\\\') || fullPath.startsWith('//')) {
      return { result: true }
    }

    const fs = getFsImplementation()
    let stats
    try {
      stats = await fs.stat(fullPath)
    } catch {
      const cwdSuggestion = await suggestPathUnderCwd(fullPath)
      let message = `Directory does not exist: ${path}. ${FILE_NOT_FOUND_CWD_NOTE}`
      if (cwdSuggestion) {
        message += ` Did you mean ${cwdSuggestion}?`
      }
      return {
        result: false,
        message,
        errorCode: 1,
      }
    }

    if (!stats.isDirectory()) {
      return {
        result: false,
        message: `Path is not a directory: ${path}`,
        errorCode: 2,
      }
    }

    return { result: true }
  },
  async call(input) {
    const fullPath = expandPath(input.path)
    const ignore = input.ignore ?? []
    const entries = (await getFsImplementation().readdir(fullPath))
      .filter(entry => !shouldIgnore(entry.name, ignore))
      .map(entry => ({
        name: entry.name,
        path: join(fullPath, entry.name),
        type: entry.isDirectory()
          ? ('directory' as const)
          : entry.isSymbolicLink()
            ? ('symlink' as const)
            : entry.isFile()
              ? ('file' as const)
              : ('other' as const),
      }))
      .sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name)
        if (a.type === 'directory') return -1
        if (b.type === 'directory') return 1
        return a.name.localeCompare(b.name)
      })

    return {
      data: {
        path: fullPath,
        entries,
      },
    }
  },
  mapToolResultToToolResultBlockParam(output: Output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: renderEntries(output),
    }
  },
  extractSearchText(output) {
    return renderEntries(output)
  },
})

function shouldIgnore(name: string, ignore: string[]): boolean {
  return ignore.some(
    pattern => pattern === name || matchWildcardPattern(pattern, name),
  )
}

function renderEntries(output: Output): string {
  if (output.entries.length === 0) {
    return `No entries found in ${output.path}`
  }
  return output.entries
    .map(entry => (entry.type === 'directory' ? `${entry.name}/` : entry.name))
    .join('\n')
}
