import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'

export type CoordinateMode = 'pixels' | 'relative' | 'absolute' | string

export type CuSubGates = {
  pixelValidation: boolean
  clipboardPasteMultiline: boolean
  mouseAnimation: boolean
  hideBeforeAction: boolean
  autoTargetDisplay: boolean
  clipboardGuard: boolean
}

export type CuGrantFlags = {
  clipboardRead?: boolean
  clipboardWrite?: boolean
  systemKeyCombos?: boolean
}

export type CuAllowedApp = {
  bundleId: string
  displayName?: string
  path?: string
}

export type CuPermissionRequest = {
  apps?: CuAllowedApp[]
  tccState?: {
    accessibility: boolean
    screenRecording: boolean
  }
  grantFlags?: CuGrantFlags
}

export type CuPermissionResponse = {
  granted: CuAllowedApp[]
  denied: CuAllowedApp[]
  flags: Required<CuGrantFlags>
}

export type ScreenshotDims = {
  width: number
  height: number
  displayWidth?: number
  displayHeight?: number
  displayId?: number
  originX?: number
  originY?: number
}

export type CuCallToolResult = CallToolResult

export type ComputerUseSessionContext = {
  getAllowedApps: () => CuAllowedApp[]
  getGrantFlags: () => Required<CuGrantFlags>
  getUserDeniedBundleIds: () => string[]
  getSelectedDisplayId: () => number | undefined
  getDisplayPinnedByModel: () => boolean
  getDisplayResolvedForApps: () => string | undefined
  getLastScreenshotDims: () => ScreenshotDims | undefined
  onPermissionRequest: (
    req: CuPermissionRequest,
    signal?: AbortSignal,
  ) => Promise<CuPermissionResponse>
  onAllowedAppsChanged: (
    apps: CuAllowedApp[],
    flags: Required<CuGrantFlags>,
  ) => void
  onAppsHidden: (ids: string[]) => void
  onResolvedDisplayUpdated: (id: number | undefined) => void
  onDisplayPinned: (id: number | undefined) => void
  onDisplayResolvedForApps: (key: string | undefined) => void
  onScreenshotCaptured: (dims: ScreenshotDims) => void
  checkCuLock: () => Promise<{ holder?: string; isSelf: boolean }>
  acquireCuLock: () => Promise<void>
  releaseCuLock: () => Promise<void>
  getSubGates?: () => CuSubGates
}

export type DisplayGeometry = {
  id?: number
  width: number
  height: number
  scaleFactor: number
  originX?: number
  originY?: number
}

export type FrontmostApp = {
  bundleId: string
  displayName: string
}

export type InstalledApp = {
  bundleId: string
  displayName: string
  path: string
  iconDataUrl?: string
}

export type RunningApp = {
  bundleId: string
  displayName: string
  pid?: number
}

export type ResolvePrepareCaptureResult = {
  base64: string
  width: number
  height: number
  displayWidth?: number
  displayHeight?: number
  displayId?: number
  originX?: number
  originY?: number
  hidden?: string[]
}

export type ScreenshotResult = {
  base64: string
  width: number
  height: number
  displayWidth?: number
  displayHeight?: number
  displayId?: number
  originX?: number
  originY?: number
}

export type ComputerExecutor = {
  capabilities: Record<string, unknown>
  prepareForAction: (
    allowlistBundleIds: string[],
    displayId?: number,
  ) => Promise<string[]>
  previewHideSet: (
    allowlistBundleIds: string[],
    displayId?: number,
  ) => Promise<Array<{ bundleId: string; displayName: string }>>
  getDisplaySize: (displayId?: number) => Promise<DisplayGeometry>
  listDisplays: () => Promise<DisplayGeometry[]>
  findWindowDisplays: (
    bundleIds: string[],
  ) => Promise<Array<{ bundleId: string; displayIds: number[] }>>
  resolvePrepareCapture: (opts: {
    allowedBundleIds: string[]
    preferredDisplayId?: number
    autoResolve: boolean
    doHide?: boolean
  }) => Promise<ResolvePrepareCaptureResult>
  screenshot: (opts: {
    allowedBundleIds: string[]
    displayId?: number
  }) => Promise<ScreenshotResult>
  zoom: (
    regionLogical: { x: number; y: number; w: number; h: number },
    allowedBundleIds: string[],
    displayId?: number,
  ) => Promise<{ base64: string; width: number; height: number }>
  key: (keySequence: string, repeat?: number) => Promise<void>
  holdKey: (keyNames: string[], durationMs: number) => Promise<void>
  type: (text: string, opts: { viaClipboard: boolean }) => Promise<void>
  readClipboard: () => Promise<string>
  writeClipboard: (text: string) => Promise<void>
  moveMouse: (x: number, y: number) => Promise<void>
  click: (
    x: number,
    y: number,
    button: 'left' | 'right' | 'middle',
    count: 1 | 2 | 3,
    modifiers?: string[],
  ) => Promise<void>
  mouseDown: () => Promise<void>
  mouseUp: () => Promise<void>
  getCursorPosition: () => Promise<{ x: number; y: number }>
  drag: (
    from: { x: number; y: number } | undefined,
    to: { x: number; y: number },
  ) => Promise<void>
  scroll: (x: number, y: number, dx: number, dy: number) => Promise<void>
  getFrontmostApp: () => Promise<FrontmostApp | null>
  appUnderPoint: (
    x: number,
    y: number,
  ) => Promise<{ bundleId: string; displayName: string } | null>
  listInstalledApps: () => Promise<InstalledApp[]>
  getAppIcon: (path: string) => Promise<string | undefined>
  listRunningApps: () => Promise<RunningApp[]>
  openApp: (bundleId: string) => Promise<void>
}

export type Logger = {
  silly: (message: string, ...args: unknown[]) => void
  debug: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
}

export type ComputerUseHostAdapter = {
  serverName: string
  logger: Logger
  executor: ComputerExecutor
  ensureOsPermissions: () => Promise<
    | { granted: true }
    | { granted: false; accessibility: boolean; screenRecording: boolean }
  >
  isDisabled: () => boolean
  getSubGates: () => CuSubGates
  getAutoUnhideEnabled: () => boolean
  cropRawPatch: (...args: unknown[]) => unknown
}

export const DEFAULT_GRANT_FLAGS: Required<CuGrantFlags> = {
  clipboardRead: false,
  clipboardWrite: false,
  systemKeyCombos: false,
}

export const API_RESIZE_PARAMS: Record<string, unknown> = {}

export function targetImageSize(width: number, height: number): [number, number] {
  return [width, height]
}

const COMPUTER_USE_TOOLS: Tool[] = [
  {
    name: 'request_access',
    description:
      'Request local OS permissions and application access for computer control.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'screenshot',
    description: 'Capture the current screen for local computer control.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'computer',
    description: 'Perform a local mouse or keyboard action.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'switch_display',
    description: 'Choose which display local computer control should target.',
    inputSchema: { type: 'object', properties: {} },
  },
]

export function buildComputerUseTools(): Tool[] {
  return COMPUTER_USE_TOOLS
}

export function createComputerUseMcpServer(
  adapter: ComputerUseHostAdapter,
): Server {
  const server = new Server(
    { name: adapter.serverName, version: MACRO.VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: adapter.isDisabled() ? [] : buildComputerUseTools(),
  }))

  server.setRequestHandler(
    CallToolRequestSchema,
    async ({ params }): Promise<CallToolResult> => ({
      content: [
        {
          type: 'text',
          text: `Computer-use tool "${params.name}" is not available through the Chimera local MCP compatibility layer yet.`,
        },
      ],
      isError: true,
    }),
  )

  return server
}

export function bindSessionContext(
  _ctx: ComputerUseSessionContext,
): (name: string, args: unknown) => Promise<CuCallToolResult> {
  return async name => ({
    content: [
      {
        type: 'text',
        text: `Computer-use tool "${name}" is not available through the Chimera local MCP compatibility layer yet.`,
      },
    ],
    isError: true,
  })
}

export function getSentinelCategory(): string | undefined {
  return undefined
}
