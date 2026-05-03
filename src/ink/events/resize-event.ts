import type { TerminalEvent } from './terminal-event.js'

export type ResizeEvent = TerminalEvent & {
  type: 'resize'
  columns: number
  rows: number
}
