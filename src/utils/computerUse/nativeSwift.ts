import type {
  DisplayGeometry,
  InstalledApp,
  ResolvePrepareCaptureResult,
  RunningApp,
  ScreenshotResult,
} from './nativeMcp.js'

export type ComputerUseAPI = {
  tcc: {
    checkAccessibility: () => boolean
    checkScreenRecording: () => boolean
  }
  display: {
    getSize: (displayId?: number) => DisplayGeometry
    listAll: () => DisplayGeometry[]
  }
  screenshot: {
    captureExcluding: (
      allowedBundleIds: string[],
      quality: number,
      width: number,
      height: number,
      displayId?: number,
    ) => Promise<ScreenshotResult>
    captureRegion: (
      allowedBundleIds: string[],
      x: number,
      y: number,
      w: number,
      h: number,
      outW: number,
      outH: number,
      quality: number,
      displayId?: number,
    ) => Promise<{ base64: string; width: number; height: number }>
  }
  apps: {
    prepareDisplay: (
      allowlistBundleIds: string[],
      hostBundleId: string,
      displayId?: number,
    ) => Promise<{ hidden: string[]; activated?: string }>
    previewHideSet: (
      allowlistBundleIds: string[],
      displayId?: number,
    ) => Promise<Array<{ bundleId: string; displayName: string }>>
    findWindowDisplays: (
      bundleIds: string[],
    ) => Promise<Array<{ bundleId: string; displayIds: number[] }>>
    appUnderPoint: (
      x: number,
      y: number,
    ) => Promise<{ bundleId: string; displayName: string } | null>
    listInstalled: () => Promise<InstalledApp[]>
    iconDataUrl: (path: string) => string | undefined
    listRunning: () => RunningApp[]
    open: (bundleId: string) => Promise<void>
    unhide: (bundleIds: string[]) => Promise<void>
  }
  resolvePrepareCapture: (
    allowedBundleIds: string[],
    hostBundleId: string,
    quality: number,
    targetW: number,
    targetH: number,
    preferredDisplayId: number | undefined,
    autoResolve: boolean,
    doHide: boolean | undefined,
  ) => Promise<ResolvePrepareCaptureResult>
}

function unavailable(name: string): never {
  throw new Error(
    `${name} requires native macOS computer-use support, which is not bundled with Chimera yet.`,
  )
}

export function isNativeComputerUseAvailable(): boolean {
  return false
}

export const nativeComputerUse: ComputerUseAPI = {
  tcc: {
    checkAccessibility: () => false,
    checkScreenRecording: () => false,
  },
  display: {
    getSize: () => unavailable('display.getSize'),
    listAll: () => [],
  },
  screenshot: {
    captureExcluding: async () => unavailable('screenshot.captureExcluding'),
    captureRegion: async () => unavailable('screenshot.captureRegion'),
  },
  apps: {
    prepareDisplay: async () => ({ hidden: [] }),
    previewHideSet: async () => [],
    findWindowDisplays: async () => [],
    appUnderPoint: async () => null,
    listInstalled: async () => [],
    iconDataUrl: () => undefined,
    listRunning: () => [],
    open: async () => unavailable('apps.open'),
    unhide: async () => {},
  },
  resolvePrepareCapture: async () => unavailable('resolvePrepareCapture'),
}
