import { createRequire } from 'module'
import {
  getClaudeCodeVendorBinaryPath,
  type VendorPathOptions,
} from './vendorPaths.js'

const requireFromHere = createRequire(import.meta.url)

export type AudioCaptureNative = {
  startRecording(onData: (chunk: Buffer) => void, onEnd: () => void): boolean
  stopRecording(): void
  isRecording(): boolean
  startPlayback?: (sampleRate: number, channels: number) => boolean
  writePlaybackData?: (chunk: Buffer) => void
  stopPlayback?: () => void
  isPlaying?: () => boolean
  microphoneAuthorizationStatus?: () => number
}

type AudioCaptureLoadOptions = VendorPathOptions & {
  cache?: boolean
}

let cachedNative: AudioCaptureNative | null | undefined

export function getAudioCaptureNativePath(
  options: VendorPathOptions = {},
): string | null {
  return getClaudeCodeVendorBinaryPath(
    'audio-capture',
    'audio-capture.node',
    options,
  )
}

export function loadAudioCaptureNative(
  options: AudioCaptureLoadOptions = {},
): AudioCaptureNative | null {
  const useCache =
    options.cache !== false &&
    options.packageRoot === undefined &&
    options.arch === undefined &&
    options.platform === undefined

  if (useCache && cachedNative !== undefined) {
    return cachedNative
  }

  const nativePath = getAudioCaptureNativePath(options)
  if (!nativePath) {
    if (useCache) cachedNative = null
    return null
  }

  try {
    const loaded = requireFromHere(nativePath) as unknown
    const native = unwrapDefault(loaded)
    if (!isAudioCaptureNative(native)) {
      if (useCache) cachedNative = null
      return null
    }
    if (useCache) cachedNative = native
    return native
  } catch {
    if (useCache) cachedNative = null
    return null
  }
}

export function resetAudioCaptureNativeForTesting(): void {
  cachedNative = undefined
}

function unwrapDefault(mod: unknown): unknown {
  if (
    mod &&
    typeof mod === 'object' &&
    'default' in mod &&
    (mod as { default?: unknown }).default
  ) {
    return (mod as { default: unknown }).default
  }
  return mod
}

function isAudioCaptureNative(mod: unknown): mod is AudioCaptureNative {
  if (!mod || typeof mod !== 'object') {
    return false
  }

  const maybe = mod as Partial<AudioCaptureNative>
  return (
    typeof maybe.startRecording === 'function' &&
    typeof maybe.stopRecording === 'function' &&
    typeof maybe.isRecording === 'function' &&
    isOptionalFunction(maybe.startPlayback) &&
    isOptionalFunction(maybe.writePlaybackData) &&
    isOptionalFunction(maybe.stopPlayback) &&
    isOptionalFunction(maybe.isPlaying) &&
    isOptionalFunction(maybe.microphoneAuthorizationStatus)
  )
}

function isOptionalFunction(value: unknown): boolean {
  return value === undefined || typeof value === 'function'
}
