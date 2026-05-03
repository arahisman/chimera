import type { TerminalEvent } from './terminal-event.js'

export type PasteEvent = TerminalEvent & {
  type: 'paste'
  text: string
}
