import type { StdoutMessage } from 'src/entrypoints/sdk/controlTypes.js'

export type Transport = {
  connect(): Promise<void>
  close(): void | Promise<void>
  write(message: StdoutMessage): Promise<void>
  setOnData(callback: (data: string) => void): void
  setOnClose(callback: (closeCode?: number) => void): void
  setOnConnect?(callback: () => void): void
}
