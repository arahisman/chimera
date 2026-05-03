import * as React from 'react'
import { Box, Text } from '../../ink.js'

export type ChimeraTerminalMascotSize =
  | 'status'
  | 'running'
  | 'welcome'
  | 'banner'

type Props = {
  size?: ChimeraTerminalMascotSize
  frame?: number
}

export const CHIMERA_TERMINAL_MASCOT_SIZES: Record<
  ChimeraTerminalMascotSize,
  { columns: number; rows: number }
> = {
  status: { columns: 8, rows: 3 },
  running: { columns: 18, rows: 5 },
  welcome: { columns: 18, rows: 7 },
  banner: { columns: 18, rows: 7 },
}

const STATUS_FRAME = [' ▛▄  ▄▜ ', '▗█▀██▀█▖', '▝▀████▛▘']

export const RUNNING_FRAMES = [
  [
    '   ▄▖    ▗▄▖▗▖    ',
    '   ▝█    ▟█████▖  ',
    '▝▘ ▐█▖▄████████▘  ',
    '▗▄▜ ▄██▛▀▀█▙▄▄▖   ',
    ' ▗ █▀▀▘    ▀▀▝▘   ',
  ],
  [
    '   ▄▖   ▗▄▖▗▖     ',
    '   ▀█▌  ▟█████▖   ',
    '▗▄ ▐▙▖▄██████▛▘   ',
    '  ▗▄▄██▜█▜█▄▜▌    ',
    '  ▀█▀▘            ',
  ],
  [
    '   ▀▜▄   ▐█▄▄▙    ',
    '▗▄  █▜▄▄▄▟█████▌  ',
    '  ▄▄▟██████▀▀▀▀   ',
    ' ▝▘█▛▘   ▝▀██▀▘   ',
    '                  ',
  ],
  [
    '   ▄▄      ▗▖ ▗   ',
    '    ▟▌   ▄▄▐███▙▖ ',
    '    ▀█▙██████▙█▙█ ',
    ' ▝▛ ▚███▀▀▀█▛▀▀▀  ',
    '  ▝ ▝ ▘    ▝▀▀▀▘  ',
  ],
  [
    '     ▗▄ ▗        ▗',
    '  ▖  ▟███▙▖       ',
    '▗▙  ▄█████▀    ▝▘ ',
    ' ▗▖▟████▘      ▗▖▗',
    ' ▗▀▀██▛█▛▜     ▝  ',
  ],
  [
    ' ▄▄▖   ▗▄▖▗▖      ',
    '  ▗█   ▟█████▖    ',
    '  ▐▙▗▟███████▘   ▀',
    ' ▖▄▟██▜▛█▙▟▙▖     ',
    ' ▐▛▀▀    ▝▀       ',
  ],
  [
    '  ▗▄▄   ▗▄▖▗▖     ',
    '   ▗▟▌  ▟█████▖   ',
    '▝▘ ▝█▄▟███████▘   ',
    ' ▗▄▜▄▟█▛▛▜█▟█▖    ',
    '   ▝▘      ▀      ',
  ],
  [
    '                  ',
    '    ▐█▄     ▄▖ ▖  ',
    '  ▄▖ ▟▛ ▄▟█▙▙███▙ ',
    '   ▗▖▝▜██████████▘',
    '  ▀▘▞▐▝▜███▀▜██▜█ ',
  ],
] as const

const WELCOME_ROWS = [
  '  ▐█          █▌  ',
  '  ▐▘▀▙▖    ▗▄▛▝▌  ',
  '  ▐▙▄█████████▙▌  ',
  ' ████████████████ ',
  '▄████ ██████ ███▟▄',
  ' ▄███████▀▜█████▌ ',
  '  ▝▀▜███▄▄▟███▀▘  ',
]

const BANNER_ROWS = [
  '  ▐█          █▌  ',
  '  ▐▘▀▙▖    ▗▄▛▝▌  ',
  '  ▐▙▄█████████▙▌  ',
  ' ████████████████ ',
  '▄████ ██████ ███▟▄',
  ' ▄███████▀▜█████▌ ',
  '  ▝▀▜███▄▄▟███▀▘  ',
]

const ORANGE_EAR_CELLS = new Set([
  'welcome:0:14',
  'welcome:0:15',
  'welcome:1:12',
  'welcome:1:13',
  'welcome:1:14',
  'welcome:1:15',
  'welcome:2:14',
  'welcome:2:15',
  'banner:0:14',
  'banner:0:15',
  'banner:1:12',
  'banner:1:13',
  'banner:1:14',
  'banner:1:15',
  'banner:2:14',
  'banner:2:15',
])

const BODY_CHARS = new Set('▗▖▘▝▛▜▙▟▀▄█▌▐▚▞')
const WING_CHARS = new Set('╱╲')
const EYE_CHARS = new Set('•')
const DUST_CHARS = new Set('·')
const ACCENT_CHARS = new Set('✦')

function rowsForSize(
  size: ChimeraTerminalMascotSize,
  frame: number,
): readonly string[] {
  switch (size) {
    case 'running':
      return RUNNING_FRAMES[frame % RUNNING_FRAMES.length]!
    case 'welcome':
      return WELCOME_ROWS
    case 'banner':
      return BANNER_ROWS
    case 'status':
    default:
      return STATUS_FRAME
  }
}

function normalizeRow(row: string, size: ChimeraTerminalMascotSize): string {
  return row
    .slice(0, CHIMERA_TERMINAL_MASCOT_SIZES[size].columns)
    .padEnd(CHIMERA_TERMINAL_MASCOT_SIZES[size].columns, ' ')
}

export function ChimeraTerminalMascot({
  size = 'status',
  frame = 0,
}: Props): React.ReactNode {
  const rows = rowsForSize(size, frame).map(row => normalizeRow(row, size))
  return (
    <Box flexDirection="column">
      {rows.map((row, rowIndex) => (
        <Text key={`${size}-${rowIndex}`}>
          {renderMascotLine(row, rowIndex, size)}
        </Text>
      ))}
    </Box>
  )
}

function renderMascotLine(
  row: string,
  rowIndex: number,
  size: ChimeraTerminalMascotSize,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let plainBuffer = ''

  const flushPlain = () => {
    if (!plainBuffer) return
    nodes.push(plainBuffer)
    plainBuffer = ''
  }

  for (const [columnIndex, char] of Array.from(row).entries()) {
    if (BODY_CHARS.has(char)) {
      flushPlain()
      nodes.push(
        <Text
          key={nodes.length}
          color={
            ORANGE_EAR_CELLS.has(`${size}:${rowIndex}:${columnIndex}`)
              ? 'rainbow_orange'
              : 'clawd_body'
          }
        >
          {char}
        </Text>,
      )
    } else if (WING_CHARS.has(char)) {
      flushPlain()
      nodes.push(
        <Text key={nodes.length} color="subtle" dimColor={true}>
          {char}
        </Text>,
      )
    } else if (EYE_CHARS.has(char)) {
      flushPlain()
      nodes.push(
        <Text key={nodes.length} color="clawd_background">
          {char}
        </Text>,
      )
    } else if (DUST_CHARS.has(char)) {
      flushPlain()
      nodes.push(
        <Text key={nodes.length} color="inactive" dimColor={true}>
          {char}
        </Text>,
      )
    } else if (ACCENT_CHARS.has(char)) {
      flushPlain()
      nodes.push(
        <Text key={nodes.length} color="success">
          {char}
        </Text>,
      )
    } else {
      plainBuffer += char
    }
  }

  flushPlain()
  return nodes
}
