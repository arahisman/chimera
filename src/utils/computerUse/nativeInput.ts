export type ComputerUseInputAPI = {
  moveMouse: (x: number, y: number, animated?: boolean) => Promise<void>
  mouseButton: (
    button: 'left' | 'right' | 'middle',
    action: 'click' | 'press' | 'release',
    count?: number,
  ) => Promise<void>
  mouseLocation: () => Promise<{ x: number; y: number }>
  mouseScroll: (amount: number, axis: 'vertical' | 'horizontal') => Promise<void>
  key: (key: string, action: 'press' | 'release') => Promise<void>
  keys: (keys: string[]) => Promise<void>
  typeText: (text: string) => Promise<void>
  getFrontmostAppInfo: () => { bundleId?: string; appName: string } | null
}

export type ComputerUseInput =
  | (ComputerUseInputAPI & { isSupported: true })
  | { isSupported: false }

function unavailable(name: string): never {
  throw new Error(
    `${name} requires native input support, which is not bundled with Chimera yet.`,
  )
}

export function isNativeInputAvailable(): boolean {
  return false
}

export const nativeInput: ComputerUseInputAPI = {
  moveMouse: async () => unavailable('moveMouse'),
  mouseButton: async () => unavailable('mouseButton'),
  mouseLocation: async () => unavailable('mouseLocation'),
  mouseScroll: async () => unavailable('mouseScroll'),
  key: async () => unavailable('key'),
  keys: async () => unavailable('keys'),
  typeText: async () => unavailable('typeText'),
  getFrontmostAppInfo: () => unavailable('getFrontmostAppInfo'),
}
