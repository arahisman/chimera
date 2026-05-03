import { describe, expect, test } from 'bun:test'
import { resolveClipboardCommands } from './imagePaste.js'

const available =
  (...commands: string[]) =>
  (command: string): boolean =>
    commands.includes(command)

describe('codex local image paste adapters', () => {
  test('uses osascript on macOS', () => {
    const plan = resolveClipboardCommands({
      platform: 'darwin',
      env: { CHIMERA_TMPDIR: '/tmp/chimera' },
      isCommandAvailable: available('osascript'),
    })

    expect(plan.diagnostic).toBeUndefined()
    expect(plan.screenshotPath).toBe(
      '/tmp/chimera/chimera_latest_screenshot.png',
    )
    expect(plan.commands?.checkImage).toContain('osascript')
    expect(plan.commands?.saveImage).toContain('«class PNGf»')
  })

  test('prefers wl-paste on Wayland Linux', () => {
    const plan = resolveClipboardCommands({
      platform: 'linux',
      env: { WAYLAND_DISPLAY: 'wayland-0' },
      isCommandAvailable: available('wl-paste', 'xclip'),
    })

    expect(plan.diagnostic).toBeUndefined()
    expect(plan.commands?.checkImage).toContain('wl-paste -l')
    expect(plan.commands?.checkImage).not.toContain('xclip')
    expect(plan.commands?.saveImage).toContain('wl-paste --type image/png')
  })

  test('uses xclip on X11 Linux', () => {
    const plan = resolveClipboardCommands({
      platform: 'linux',
      env: { DISPLAY: ':0' },
      isCommandAvailable: available('wl-paste', 'xclip'),
    })

    expect(plan.diagnostic).toBeUndefined()
    expect(plan.commands?.checkImage).toContain('xclip -selection clipboard')
    expect(plan.commands?.checkImage).not.toContain('wl-paste')
    expect(plan.commands?.saveImage).toContain('xclip -selection clipboard')
  })

  test('uses PowerShell on Windows', () => {
    const plan = resolveClipboardCommands({
      platform: 'win32',
      env: { TEMP: 'C:\\Temp' },
      isCommandAvailable: available('powershell'),
    })

    expect(plan.diagnostic).toBeUndefined()
    expect(plan.screenshotPath).toBe(
      'C:\\Temp\\chimera_latest_screenshot.png',
    )
    expect(plan.commands?.checkImage).toContain('powershell -NoProfile')
    expect(plan.commands?.saveImage).toContain('Get-Clipboard -Format Image')
  })

  test('returns a clear diagnostic when no clipboard command is available', () => {
    const plan = resolveClipboardCommands({
      platform: 'linux',
      env: {},
      isCommandAvailable: () => false,
    })

    expect(plan.commands).toBeNull()
    expect(plan.diagnostic).toContain('No supported clipboard image command')
    expect(plan.diagnostic).toContain('wl-paste')
    expect(plan.diagnostic).toContain('xclip')
  })
})
