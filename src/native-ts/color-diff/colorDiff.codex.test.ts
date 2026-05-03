import { afterEach, describe, expect, test } from 'bun:test'
import type { StructuredPatchHunk } from 'diff'
import stripAnsi from 'strip-ansi'
import {
  getColorModuleUnavailableReason,
  getSyntaxTheme,
  expectColorDiff,
  expectColorFile,
} from '../../components/StructuredDiff/colorDiff.js'
import { ColorDiff, ColorFile } from './index.js'

const ORIGINAL_COLORTERM = process.env.COLORTERM
const ORIGINAL_SYNTAX_HIGHLIGHT =
  process.env.CHIMERA_SYNTAX_HIGHLIGHT

afterEach(() => {
  restoreEnv('COLORTERM', ORIGINAL_COLORTERM)
  restoreEnv('CHIMERA_SYNTAX_HIGHLIGHT', ORIGINAL_SYNTAX_HIGHLIGHT)
})

describe('codex color diff renderer', () => {
  test('renders highlighted structured diffs through the TypeScript fallback', () => {
    process.env.COLORTERM = 'truecolor'
    const patch: StructuredPatchHunk = {
      oldStart: 1,
      oldLines: 4,
      newStart: 1,
      newLines: 4,
      lines: [
        ' function greet(name: string) {',
        '-  return "hello " + name',
        '+  return "hello codex " + name',
        ' }',
      ],
    }

    const rendered = new ColorDiff(
      patch,
      'function greet(name: string) {',
      'demo.ts',
      'function greet(name: string) {\n  return "hello " + name\n}\n',
    ).render('dark', 72, false)

    expect(rendered).toBeArray()
    expect(rendered).not.toBeNull()
    expect(rendered!.join('\n')).toContain('\x1b[')

    const plain = rendered!.map(line => stripAnsi(line))
    expect(plain).toHaveLength(4)
    expect(plain[0]).toContain('function greet(name: string) {')
    expect(plain[1]).toContain('2 -  return "hello " + name')
    expect(plain[2]).toContain('2 +  return "hello codex " + name')
    expect(plain[3]).toContain('}')
  })

  test('wraps long diff lines without losing markers or line numbers', () => {
    const patch: StructuredPatchHunk = {
      oldStart: 42,
      oldLines: 1,
      newStart: 42,
      newLines: 1,
      lines: [
        '-  const label = "abcdefghijklmnopqrstuvwxyz"',
        '+  const label = "abcdefghijklmnopqrstuvwxyz codex"',
      ],
    }

    const rendered = new ColorDiff(patch, null, 'demo.ts', null).render(
      'dark-ansi',
      24,
      false,
    )
    const plain = rendered!.map(line => stripAnsi(line))

    expect(plain.length).toBeGreaterThan(2)
    expect(plain[0]).toStartWith(' 42 -')
    expect(plain.some(line => line.startsWith(' 42 +'))).toBe(true)
    expect(plain.some(line => line.trimStart().startsWith('-'))).toBe(true)
    expect(plain.some(line => line.trimStart().startsWith('+'))).toBe(true)
    expect(plain.join('\n')).toContain('ab')
    expect(plain.join('\n')).toContain('cdefghijklmnopqrstu')
    expect(plain.join('\n')).toContain('vwxyz')
    expect(plain.join('\n')).toContain('codex')
  })

  test('renders full files through the same native-compatible API', () => {
    const rendered = new ColorFile(
      'const answer = 42\nconsole.log(answer)\n',
      'demo.ts',
    ).render('dark', 80, false)

    expect(rendered).toBeArray()
    expect(rendered).toHaveLength(2)
    expect(rendered!.join('\n')).toContain('\x1b[')

    const plain = rendered!.map(line => stripAnsi(line))
    expect(plain[0]).toContain('1 const answer = 42')
    expect(plain[1]).toContain('2 console.log(answer)')
  })

  test('honors the syntax-highlighting kill switch', () => {
    process.env.CHIMERA_SYNTAX_HIGHLIGHT = 'false'

    expect(getColorModuleUnavailableReason()).toBe('env')
    expect(expectColorDiff()).toBeNull()
    expect(expectColorFile()).toBeNull()
    expect(getSyntaxTheme('dark')).toBeNull()
  })
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
