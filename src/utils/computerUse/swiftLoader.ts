import type { ComputerUseAPI } from './nativeSwift.js'
import { nativeComputerUse } from './nativeSwift.js'

let cached: ComputerUseAPI | undefined

/**
 * Chimera-owned native macOS computer-use loader. The current build exposes a
 * local compatibility surface without bundling a native capture backend yet.
 */
export function requireComputerUseSwift(): ComputerUseAPI {
  if (process.platform !== 'darwin') {
    throw new Error('Chimera native computer-use is macOS-only')
  }
  return (cached ??= nativeComputerUse)
}

export type { ComputerUseAPI }
