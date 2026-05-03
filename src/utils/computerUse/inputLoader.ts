import type {
  ComputerUseInput,
  ComputerUseInputAPI,
} from './nativeInput.js'
import { nativeInput } from './nativeInput.js'

let cached: ComputerUseInputAPI | undefined

/**
 * Chimera-owned native input loader. The current build does not bundle a
 * mouse/keyboard native module yet; callers get a clear runtime error if the
 * computer-use gate is enabled before that backend is installed.
 */
export function requireComputerUseInput(): ComputerUseInputAPI {
  if (cached) return cached
  const input = { ...nativeInput, isSupported: false } as ComputerUseInput
  if (!input.isSupported) {
    throw new Error('Chimera native input is not supported in this build')
  }
  return (cached = input)
}
