import { z } from 'zod/v4'
import { buildTool, type ToolUseContext } from '../../Tool.js'
import {
  FILE_NOT_FOUND_CWD_NOTE,
  getFileModificationTime,
  suggestPathUnderCwd,
  writeTextContent,
} from '../../utils/file.js'
import { readFileSyncWithMetadata } from '../../utils/fileRead.js'
import { getFsImplementation } from '../../utils/fsOperations.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { expandPath } from '../../utils/path.js'
import {
  checkWritePermissionForTool,
  matchingRuleForInput,
} from '../../utils/permissions/filesystem.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { matchWildcardPattern } from '../../utils/permissions/shellRuleMatching.js'
import { FILE_UNEXPECTEDLY_MODIFIED_ERROR } from '../FileEditTool/constants.js'

export const MULTI_EDIT_TOOL_NAME = 'MultiEdit'

const editSchema = lazySchema(() =>
  z.strictObject({
    old_string: z.string().describe('Text to replace'),
    new_string: z.string().describe('Replacement text'),
    replace_all: z
      .boolean()
      .optional()
      .describe('Replace all occurrences of old_string when true'),
  }),
)

const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z
      .string()
      .describe('The absolute path to the file to edit'),
    edits: z
      .array(editSchema())
      .min(1)
      .describe('Ordered edits to apply to the file'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    filePath: z.string(),
    editsApplied: z.number(),
    originalFile: z.string(),
    updatedFile: z.string(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

export const MultiEditTool = buildTool({
  name: MULTI_EDIT_TOOL_NAME,
  searchHint: 'apply multiple file edits',
  maxResultSizeChars: 100_000,
  strict: true,
  async description() {
    return 'A tool for applying multiple ordered edits to one file'
  },
  async prompt() {
    return `Applies multiple ordered text replacements to a single file.

Usage:
- The file_path parameter must be an absolute path.
- The edits array is applied in order against the updated content from the previous edit.
- Each edit must include old_string and new_string.
- Set replace_all to true only when every occurrence should be replaced.
- Read the file before editing it.`
  },
  userFacingName() {
    return 'MultiEdit'
  },
  getToolUseSummary(input) {
    return input?.file_path ?? null
  },
  getActivityDescription(input) {
    return input?.file_path ? `Editing ${input.file_path}` : 'Editing file'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  getPath(input): string {
    return input.file_path
  },
  backfillObservableInput(input) {
    if (typeof input.file_path === 'string') {
      input.file_path = expandPath(input.file_path)
    }
  },
  async preparePermissionMatcher({ file_path }) {
    return pattern => matchWildcardPattern(pattern, file_path)
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    return checkWritePermissionForTool(
      MultiEditTool,
      input,
      appState.toolPermissionContext,
    )
  },
  toAutoClassifierInput(input) {
    return {
      file_path: input.file_path,
      edits: input.edits.map(edit => ({
        old_string: edit.old_string,
        new_string: edit.new_string,
      })),
    }
  },
  renderToolUseMessage(input) {
    const editCount = input.edits?.length ?? 0
    return `MultiEdit(${input.file_path ?? 'file'}, ${editCount} edits)`
  },
  renderToolResultMessage(output) {
    return `Applied ${output.editsApplied} edits to ${output.filePath}`
  },
  renderToolUseErrorMessage(content) {
    return String(content)
  },
  async validateInput(input: Input, toolUseContext: ToolUseContext) {
    const fullFilePath = expandPath(input.file_path)
    const appState = toolUseContext.getAppState()
    const denyRule = matchingRuleForInput(
      fullFilePath,
      appState.toolPermissionContext,
      'edit',
      'deny',
    )
    if (denyRule !== null) {
      return {
        result: false,
        message:
          'File is in a directory that is denied by your permission settings.',
        errorCode: 1,
      }
    }

    for (const [index, edit] of input.edits.entries()) {
      if (edit.old_string === edit.new_string) {
        return {
          result: false,
          message: `Edit ${index + 1} has identical old_string and new_string.`,
          errorCode: 2,
        }
      }
    }

    if (fullFilePath.startsWith('\\\\') || fullFilePath.startsWith('//')) {
      return { result: true }
    }

    try {
      getFsImplementation().statSync(fullFilePath)
    } catch {
      const cwdSuggestion = await suggestPathUnderCwd(fullFilePath)
      let message = `File does not exist: ${input.file_path}. ${FILE_NOT_FOUND_CWD_NOTE}`
      if (cwdSuggestion) {
        message += ` Did you mean ${cwdSuggestion}?`
      }
      return {
        result: false,
        message,
        errorCode: 3,
      }
    }

    const lastRead = toolUseContext.readFileState.get(fullFilePath)
    if (!lastRead) {
      return {
        result: false,
        message: 'File has not been read yet. Read it first before editing it.',
        errorCode: 4,
      }
    }
    if (getFileModificationTime(fullFilePath) > lastRead.timestamp) {
      return {
        result: false,
        message: FILE_UNEXPECTEDLY_MODIFIED_ERROR,
        errorCode: 5,
      }
    }

    return { result: true }
  },
  async call(input, { readFileState }) {
    const fullFilePath = expandPath(input.file_path)
    const { content, encoding, lineEndings } =
      readFileSyncWithMetadata(fullFilePath)
    let updatedFile = content

    for (const [index, edit] of input.edits.entries()) {
      if (!updatedFile.includes(edit.old_string)) {
        throw new Error(
          `Edit ${index + 1} old_string was not found in ${input.file_path}.`,
        )
      }
      updatedFile = edit.replace_all
        ? updatedFile.split(edit.old_string).join(edit.new_string)
        : updatedFile.replace(edit.old_string, edit.new_string)
    }

    writeTextContent(fullFilePath, updatedFile, encoding, lineEndings)
    readFileState.set(fullFilePath, {
      content: updatedFile,
      timestamp: getFileModificationTime(fullFilePath),
      offset: undefined,
      limit: undefined,
    })

    return {
      data: {
        filePath: fullFilePath,
        editsApplied: input.edits.length,
        originalFile: content,
        updatedFile,
      },
    }
  },
  mapToolResultToToolResultBlockParam(output: Output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Applied ${output.editsApplied} edits to ${output.filePath}\n\n${output.updatedFile}`,
    }
  },
  extractSearchText(output) {
    return output.updatedFile
  },
})
