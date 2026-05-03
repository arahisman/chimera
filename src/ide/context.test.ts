import { describe, expect, test } from 'bun:test'
import { normalizeIdeContext } from './context.js'

describe('IDE context normalization', () => {
  test('normalizes file URIs to absolute paths', () => {
    const context = normalizeIdeContext({
      workspaceFolders: [{ uri: 'file:///tmp/project', name: 'project' }],
      activeFile: {
        uri: 'file:///tmp/project/src/app.ts',
        languageId: 'typescript',
        selectedRanges: [
          {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 10 },
          },
        ],
      },
      visibleEditors: ['file:///tmp/project/src/app.ts'],
    })

    expect(context.workspaceRoots).toEqual(['/tmp/project'])
    expect(context.activeFile).toEqual({
      path: '/tmp/project/src/app.ts',
      languageId: 'typescript',
      selectedRanges: [
        {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 10 },
        },
      ],
    })
    expect(context.visibleFiles).toEqual(['/tmp/project/src/app.ts'])
  })

  test('keeps selection text only below byte limit', () => {
    const context = normalizeIdeContext(
      {
        selections: [
          {
            uri: 'file:///tmp/project/src/app.ts',
            ranges: [
              {
                start: { line: 1, character: 0 },
                end: { line: 1, character: 3 },
              },
            ],
            text: 'abcdef',
          },
        ],
      },
      { maxSelectionTextBytes: 3 },
    )

    expect(context.selections[0]).toMatchObject({
      path: '/tmp/project/src/app.ts',
      text: undefined,
    })
    expect(context.selections[0]?.textHash).toHaveLength(64)
  })

  test('groups diagnostics by file and sorts by severity', () => {
    const context = normalizeIdeContext({
      diagnostics: [
        {
          uri: 'file:///tmp/project/src/app.ts',
          range: {
            start: { line: 2, character: 0 },
            end: { line: 2, character: 1 },
          },
          severity: 'warning',
          message: 'warning',
        },
        {
          uri: 'file:///tmp/project/src/app.ts',
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 1 },
          },
          severity: 'error',
          message: 'error',
        },
      ],
    })

    expect(context.diagnosticsByPath['/tmp/project/src/app.ts']?.map(d => d.severity))
      .toEqual(['error', 'warning'])
  })

  test('normalizes git and terminal context', () => {
    const context = normalizeIdeContext({
      git: {
        rootUri: 'file:///tmp/project',
        branch: 'main',
        changedFiles: ['file:///tmp/project/src/app.ts'],
        stagedFiles: ['file:///tmp/project/src/index.ts'],
      },
      terminal: {
        cwd: 'file:///tmp/project',
        shell: 'zsh',
      },
    })

    expect(context.git).toEqual({
      rootPath: '/tmp/project',
      branch: 'main',
      changedFiles: ['/tmp/project/src/app.ts'],
      stagedFiles: ['/tmp/project/src/index.ts'],
    })
    expect(context.terminal).toEqual({
      cwd: '/tmp/project',
      shell: 'zsh',
    })
  })
})
