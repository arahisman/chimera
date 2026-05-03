import { createHash } from 'crypto'
import { fileURLToPath } from 'url'
import { resolve } from 'path'
import type {
  IdeContextUpdateParams,
  IdeDiagnosticSchema,
  IdeGitContextSchema,
  IdeRangeSchema,
} from './protocol.js'
import type { z } from 'zod/v4'

export type IdeRange = z.infer<typeof IdeRangeSchema>

export type IdeDiagnostic = Omit<
  z.infer<typeof IdeDiagnosticSchema>,
  'uri'
> & {
  path: string
}

export type IdeSelection = {
  path: string
  ranges: IdeRange[]
  text?: string
  textHash?: string
}

export type IdeGitContext = Omit<
  z.infer<typeof IdeGitContextSchema>,
  'rootUri' | 'changedFiles' | 'stagedFiles'
> & {
  rootPath: string
  changedFiles: string[]
  stagedFiles: string[]
}

export type IdeTerminalContext = {
  cwd?: string
  shell?: string
}

export type NormalizedIdeContext = {
  workspaceRoots: string[]
  activeFile?: {
    path: string
    languageId?: string
    selectedRanges: IdeRange[]
  }
  selections: IdeSelection[]
  diagnosticsByPath: Record<string, IdeDiagnostic[]>
  visibleFiles: string[]
  git?: IdeGitContext
  terminal?: IdeTerminalContext
}

export type NormalizeIdeContextOptions = {
  maxSelectionTextBytes?: number
}

const DEFAULT_MAX_SELECTION_TEXT_BYTES = 16_384
const DIAGNOSTIC_SEVERITY_ORDER = {
  error: 0,
  warning: 1,
  information: 2,
  hint: 3,
} as const

export function normalizeIdeContext(
  input: IdeContextUpdateParams,
  options: NormalizeIdeContextOptions = {},
): NormalizedIdeContext {
  const maxSelectionTextBytes =
    options.maxSelectionTextBytes ?? DEFAULT_MAX_SELECTION_TEXT_BYTES

  const diagnosticsByPath: Record<string, IdeDiagnostic[]> = {}
  for (const diagnostic of input.diagnostics ?? []) {
    const path = normalizeUriOrPath(diagnostic.uri)
    diagnosticsByPath[path] ??= []
    diagnosticsByPath[path].push({
      path,
      range: diagnostic.range,
      severity: diagnostic.severity,
      message: diagnostic.message,
      source: diagnostic.source,
      code: diagnostic.code,
    })
  }

  for (const diagnostics of Object.values(diagnosticsByPath)) {
    diagnostics.sort(
      (a, b) =>
        DIAGNOSTIC_SEVERITY_ORDER[a.severity] -
          DIAGNOSTIC_SEVERITY_ORDER[b.severity] ||
        a.range.start.line - b.range.start.line ||
        a.range.start.character - b.range.start.character,
    )
  }

  return {
    workspaceRoots: (input.workspaceFolders ?? []).map(folder =>
      normalizeUriOrPath(folder.uri),
    ),
    activeFile: input.activeFile
      ? {
          path: normalizeUriOrPath(input.activeFile.uri),
          languageId: input.activeFile.languageId,
          selectedRanges: input.activeFile.selectedRanges ?? [],
        }
      : undefined,
    selections: (input.selections ?? []).map(selection => {
      const text = selection.text
      const textBytes = text ? Buffer.byteLength(text, 'utf8') : 0
      return {
        path: normalizeUriOrPath(selection.uri),
        ranges: selection.ranges,
        text: text && textBytes <= maxSelectionTextBytes ? text : undefined,
        textHash:
          selection.textHash ??
          (text ? createHash('sha256').update(text).digest('hex') : undefined),
      }
    }),
    diagnosticsByPath,
    visibleFiles: (input.visibleEditors ?? []).map(normalizeUriOrPath),
    git: input.git
      ? {
          rootPath: normalizeUriOrPath(input.git.rootUri),
          branch: input.git.branch,
          changedFiles: input.git.changedFiles.map(normalizeUriOrPath),
          stagedFiles: input.git.stagedFiles.map(normalizeUriOrPath),
        }
      : undefined,
    terminal: input.terminal
      ? {
          cwd: input.terminal.cwd
            ? normalizeUriOrPath(input.terminal.cwd)
            : undefined,
          shell: input.terminal.shell,
        }
      : undefined,
  }
}

export function normalizeUriOrPath(value: string): string {
  if (value.startsWith('file://')) {
    return fileURLToPath(value)
  }
  return resolve(value)
}
