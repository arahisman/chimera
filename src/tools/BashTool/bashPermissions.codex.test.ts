import { describe, expect, test } from 'bun:test'
import { readFile } from 'fs/promises'
import { join } from 'path'

describe('codex bash permission parser replacement', () => {
  test('enables the distributable pure TypeScript bash parser in local builds', async () => {
    const [bundleShim, parserAdapter] = await Promise.all([
      readFile(join(process.cwd(), 'src/build-shims/bun-bundle.ts'), 'utf8'),
      readFile(join(process.cwd(), 'src/utils/bash/parser.ts'), 'utf8'),
    ])

    expect(bundleShim).toContain("'TREE_SITTER_BASH'")
    expect(parserAdapter).toContain("from './bashParser.js'")
    expect(parserAdapter).not.toMatch(
      /(?:import|require)\(['"]tree-sitter-bash['"]\)/,
    )
  })

  test('extracts permission-relevant subcommands through the pure TypeScript parser', async () => {
    const [{ parseForSecurityFromAst }, bashParser] = await Promise.all([
      import('../../utils/bash/ast.js'),
      import('../../utils/bash/bashParser.js'),
    ])
    const command = 'echo ok && rm -rf ./chimera-test-target'

    await bashParser.ensureParserInitialized()
    const parser = bashParser.getParserModule()
    const astRoot = parser?.parse(command) ?? null

    expect(astRoot).not.toBeNull()
    expect(parser).not.toBeNull()

    const result = parseForSecurityFromAst(command, astRoot!)
    expect(result.kind).toBe('simple')
    if (result.kind !== 'simple') return
    expect(result.commands.map(cmd => cmd.text)).toEqual([
      'echo ok',
      'rm -rf ./chimera-test-target',
    ])
  })
})
