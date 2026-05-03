import * as React from 'react'
import { Box, Text } from '../../ink.js'

const LETTERS: Record<string, readonly string[]> = {
  A: ['010', '101', '111', '101', '101'],
  C: ['111', '100', '100', '100', '111'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  M: ['10001', '11011', '10101', '10001', '10001'],
  O: ['111', '101', '101', '101', '111'],
  R: ['110', '101', '110', '101', '101'],
}

const WORDS = [
  { text: 'CHIMERA', color: 'clawd_body' },
  { text: 'CODE', color: 'rainbow_orange' },
] as const
const PIXEL_ROWS = 5
const TERMINAL_ROWS = Math.ceil(PIXEL_ROWS / 2)

function renderHalfBlockCell(top?: string, bottom?: string): string {
  const hasTop = top === '1'
  const hasBottom = bottom === '1'

  if (hasTop && hasBottom) {
    return '█'
  }
  if (hasTop) {
    return '▀'
  }
  if (hasBottom) {
    return '▄'
  }
  return ' '
}

function renderLetterRow(letter: string, terminalRow: number): string {
  const sourceRows = LETTERS[letter]
  if (!sourceRows) {
    return ''
  }

  const topRow = sourceRows[terminalRow * 2]
  const bottomRow = sourceRows[terminalRow * 2 + 1]
  const width = Math.max(topRow?.length ?? 0, bottomRow?.length ?? 0)

  return Array.from({ length: width }, (_, index) =>
    renderHalfBlockCell(topRow?.[index], bottomRow?.[index]),
  ).join('')
}

function renderWordRow(word: string, terminalRow: number): string {
  return Array.from(word, (letter) => renderLetterRow(letter, terminalRow)).join(
    ' ',
  )
}

export function ChimeraWordmark(): React.ReactNode {
  return (
    <Box flexDirection="column">
      {Array.from({ length: TERMINAL_ROWS }, (_, row) => (
        <Text key={row}>
          {WORDS.map((word, wordIndex) => (
            <React.Fragment key={word.text}>
              {wordIndex > 0 ? ' ' : null}
              <Text color={word.color}>{renderWordRow(word.text, row)}</Text>
            </React.Fragment>
          ))}
        </Text>
      ))}
    </Box>
  )
}
