import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createServer } from 'net'
import WebSocket from 'ws'
import type {
  ComputerAction,
  ComputerScreenshot,
  ComputerUseEnvironment,
  LocalComputerUseTarget,
} from './codexLoop.js'

export interface CdpClient {
  send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T>
  close(): void | Promise<void>
}

export type BrowserTargetHandle = {
  target: CdpComputerUseTarget
  close: () => Promise<void>
}

export type ChromeCdpTargetOptions = {
  executablePath?: string
  url?: string
  html?: string
  displayWidth?: number
  displayHeight?: number
  headless?: boolean
  userDataDir?: string
}

type CdpResponse<T> = {
  id?: number
  result?: T
  error?: { message?: string; code?: number }
}

const DEFAULT_WIDTH = 1024
const DEFAULT_HEIGHT = 768

export class CdpComputerUseTarget implements LocalComputerUseTarget {
  readonly displayWidth: number
  readonly displayHeight: number
  readonly environment: ComputerUseEnvironment = 'browser'

  constructor(
    private readonly cdp: CdpClient,
    options: {
      displayWidth: number
      displayHeight: number
      currentUrl?: string
      authenticated?: boolean
    },
  ) {
    this.displayWidth = options.displayWidth
    this.displayHeight = options.displayHeight
    this.currentUrlValue = options.currentUrl
    this.authenticated = options.authenticated ?? false
  }

  private currentUrlValue: string | undefined
  private authenticated: boolean

  currentUrl(): string | undefined {
    return this.currentUrlValue
  }

  isAuthenticatedContext(): boolean {
    return this.authenticated
  }

  async captureScreenshot(): Promise<ComputerScreenshot> {
    const result = await this.cdp.send<{ data: string }>(
      'Page.captureScreenshot',
      {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      },
    )
    return {
      base64Png: result.data,
      width: this.displayWidth,
      height: this.displayHeight,
    }
  }

  async executeActions(actions: ComputerAction[]): Promise<void> {
    for (const rawAction of actions) {
      const action = normalizeComputerAction(rawAction)
      switch (action.type) {
        case 'screenshot':
          break
        case 'wait':
          await sleep(toNumber(action.ms, 500))
          break
        case 'click':
          await this.click(toNumber(action.x, 0), toNumber(action.y, 0), 1)
          break
        case 'double_click':
          await this.click(toNumber(action.x, 0), toNumber(action.y, 0), 2)
          break
        case 'move':
          await this.mouseMove(toNumber(action.x, 0), toNumber(action.y, 0))
          break
        case 'scroll':
          await this.cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: toNumber(action.x, Math.floor(this.displayWidth / 2)),
            y: toNumber(action.y, Math.floor(this.displayHeight / 2)),
            deltaX: toNumber(action.delta_x ?? action.deltaX, 0),
            deltaY: toNumber(action.delta_y ?? action.deltaY, 0),
          })
          break
        case 'type':
          await this.cdp.send('Input.insertText', {
            text: String(action.text ?? ''),
          })
          break
        case 'keypress':
          for (const key of normalizeKeys(action.keys)) {
            await this.keyPress(key)
          }
          break
        case 'navigate':
          await this.navigate(String(action.url ?? 'about:blank'))
          break
        default:
          throw new Error(`Unsupported computer action: ${action.type}`)
      }
    }
  }

  async close(): Promise<void> {
    await this.cdp.close()
  }

  async evaluate<T = unknown>(expression: string): Promise<T | undefined> {
    const result = await this.cdp.send<{
      result?: { value?: T }
      exceptionDetails?: unknown
    }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      throw new Error('Chrome evaluation failed')
    }
    return result.result?.value
  }

  private async navigate(url: string): Promise<void> {
    this.currentUrlValue = url
    await this.cdp.send('Page.navigate', { url })
    await sleep(250)
  }

  private async mouseMove(x: number, y: number): Promise<void> {
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
    })
  }

  private async click(x: number, y: number, clickCount: number): Promise<void> {
    await this.mouseMove(x, y)
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount,
    })
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount,
    })
  }

  private async keyPress(key: string): Promise<void> {
    const normalized = normalizeKey(key)
    await this.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: normalized,
    })
    await this.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: normalized,
    })
  }
}

export function normalizeComputerAction(action: ComputerAction): ComputerAction {
  if (action.type === 'left_click') {
    return { ...action, type: 'click' }
  }
  if (action.type === 'double_left_click') {
    return { ...action, type: 'double_click' }
  }
  if (action.type === 'drag') {
    return { ...action, type: 'move' }
  }
  if (action.type === 'keypress' && typeof action.keys === 'string') {
    return { ...action, keys: [action.keys] }
  }
  return action
}

export async function createChromeCdpComputerUseTarget(
  options: ChromeCdpTargetOptions = {},
): Promise<BrowserTargetHandle> {
  const width = options.displayWidth ?? DEFAULT_WIDTH
  const height = options.displayHeight ?? DEFAULT_HEIGHT
  const executablePath = options.executablePath ?? findChromeExecutable()
  if (!executablePath) {
    throw new Error('No local Chrome/Chromium executable found for computer use')
  }

  const userDataDir =
    options.userDataDir ?? (await mkdtemp(join(tmpdir(), 'codex-cu-chrome-')))
  const shouldRemoveUserDataDir = options.userDataDir === undefined
  const port = await getFreePort()
  const url = options.html
    ? `data:text/html;charset=utf-8,${encodeURIComponent(options.html)}`
    : (options.url ?? 'about:blank')

  const chrome = spawn(executablePath, [
    `--remote-debugging-port=${String(port)}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${String(width)},${String(height)}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--disable-popup-blocking',
    ...(options.headless === false ? [] : ['--headless=new']),
    'about:blank',
  ])

  const baseUrl = `http://127.0.0.1:${String(port)}`
  try {
    await waitForChrome(baseUrl, chrome)
    const targetInfo = await openTarget(baseUrl, url)
    const cdp = await WsCdpClient.connect(targetInfo.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await sleep(250)
    const target = new CdpComputerUseTarget(cdp, {
      displayWidth: width,
      displayHeight: height,
      currentUrl: url,
      authenticated: false,
    })
    return {
      target,
      close: async () => {
        await target.close()
        await stopChrome(chrome)
        if (shouldRemoveUserDataDir) {
          await rm(userDataDir, { recursive: true, force: true })
        }
      },
    }
  } catch (error) {
    await stopChrome(chrome)
    if (shouldRemoveUserDataDir) {
      await rm(userDataDir, { recursive: true, force: true })
    }
    throw error
  }
}

class WsCdpClient implements CdpClient {
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', raw => this.onMessage(raw.toString()))
    ws.on('close', () => this.rejectAll(new Error('CDP websocket closed')))
    ws.on('error', error => this.rejectAll(error))
  }

  static async connect(url: string): Promise<WsCdpClient> {
    const ws = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    return new WsCdpClient(ws)
  }

  send<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const id = this.nextId++
    const payload = JSON.stringify({ id, method, params })
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
      })
      this.ws.send(payload)
    })
  }

  close(): void {
    this.ws.close()
  }

  private onMessage(raw: string): void {
    let message: CdpResponse<unknown>
    try {
      message = JSON.parse(raw) as CdpResponse<unknown>
    } catch {
      return
    }
    if (message.id === undefined) return
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    if (message.error) {
      pending.reject(new Error(message.error.message ?? 'CDP command failed'))
    } else {
      pending.resolve(message.result)
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
  }
}

function findChromeExecutable(): string | undefined {
  const candidates = [
    process.env.CHIMERA_CHROME_PATH,
    process.env.CODEX_CODE_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'google-chrome',
    'chromium',
    'chromium-browser',
  ].filter(Boolean) as string[]
  return candidates.find(candidate =>
    candidate.includes('/') ? existsSync(candidate) : true,
  )
}

async function openTarget(
  baseUrl: string,
  url: string,
): Promise<{ webSocketDebuggerUrl: string }> {
  const response = await fetch(`${baseUrl}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  })
  if (response.ok) {
    return (await response.json()) as { webSocketDebuggerUrl: string }
  }
  const list = (await (await fetch(`${baseUrl}/json/list`)).json()) as Array<{
    webSocketDebuggerUrl?: string
  }>
  const first = list.find(item => item.webSocketDebuggerUrl)
  if (!first?.webSocketDebuggerUrl) {
    throw new Error('Chrome DevTools did not expose a page target')
  }
  return { webSocketDebuggerUrl: first.webSocketDebuggerUrl }
}

async function waitForChrome(
  baseUrl: string,
  chrome: ChildProcessWithoutNullStreams,
): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome exited early with code ${String(chrome.exitCode)}`)
    }
    try {
      const response = await fetch(`${baseUrl}/json/version`)
      if (response.ok) return
    } catch {
      // retry
    }
    await sleep(100)
  }
  throw new Error('Timed out waiting for Chrome DevTools endpoint')
}

async function stopChrome(chrome: ChildProcessWithoutNullStreams): Promise<void> {
  if (chrome.exitCode !== null) return
  chrome.kill('SIGTERM')
  await Promise.race([
    new Promise<void>(resolve => chrome.once('exit', () => resolve())),
    sleep(2_000).then(() => {
      if (chrome.exitCode === null) chrome.kill('SIGKILL')
    }),
  ])
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not allocate local port'))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

function normalizeKeys(keys: unknown): string[] {
  if (Array.isArray(keys)) return keys.map(String)
  if (typeof keys === 'string') return [keys]
  return []
}

function normalizeKey(key: string): string {
  const normalized = key.toUpperCase()
  const aliases: Record<string, string> = {
    ENTER: 'Enter',
    RETURN: 'Enter',
    TAB: 'Tab',
    ESC: 'Escape',
    ESCAPE: 'Escape',
    BACKSPACE: 'Backspace',
    DELETE: 'Delete',
    ARROWUP: 'ArrowUp',
    ARROWDOWN: 'ArrowDown',
    ARROWLEFT: 'ArrowLeft',
    ARROWRIGHT: 'ArrowRight',
    SPACE: ' ',
  }
  return aliases[normalized] ?? key
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
