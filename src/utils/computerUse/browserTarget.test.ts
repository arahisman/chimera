import { describe, expect, test } from 'bun:test'
import {
  CdpComputerUseTarget,
  normalizeComputerAction,
  type CdpClient,
} from './browserTarget.js'

class FakeCdp implements CdpClient {
  commands: Array<{ method: string; params: Record<string, unknown> }> = []

  async send<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    this.commands.push({ method, params })
    if (method === 'Page.captureScreenshot') {
      return { data: 'png-base64' } as T
    }
    return {} as T
  }

  close(): void {}
}

describe('CDP computer-use browser target', () => {
  test('captures screenshots through Page.captureScreenshot', async () => {
    const cdp = new FakeCdp()
    const target = new CdpComputerUseTarget(cdp, {
      displayWidth: 1024,
      displayHeight: 768,
      currentUrl: 'https://example.com',
    })

    expect(await target.captureScreenshot()).toEqual({
      base64Png: 'png-base64',
      width: 1024,
      height: 768,
    })
    expect(cdp.commands).toContainEqual({
      method: 'Page.captureScreenshot',
      params: {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      },
    })
  })

  test('executes click, type, keypress, and scroll actions through CDP input events', async () => {
    const cdp = new FakeCdp()
    const target = new CdpComputerUseTarget(cdp, {
      displayWidth: 1024,
      displayHeight: 768,
    })

    await target.executeActions([
      { type: 'click', x: 10, y: 20 },
      { type: 'type', text: 'hello' },
      { type: 'keypress', keys: ['ENTER'] },
      { type: 'scroll', x: 5, y: 6, delta_y: 120 },
    ])

    expect(cdp.commands.map(command => command.method)).toEqual([
      'Input.dispatchMouseEvent',
      'Input.dispatchMouseEvent',
      'Input.dispatchMouseEvent',
      'Input.insertText',
      'Input.dispatchKeyEvent',
      'Input.dispatchKeyEvent',
      'Input.dispatchMouseEvent',
    ])
    expect(cdp.commands[1]?.params).toMatchObject({
      type: 'mousePressed',
      x: 10,
      y: 20,
      button: 'left',
      clickCount: 1,
    })
    expect(cdp.commands[3]?.params).toEqual({ text: 'hello' })
    expect(cdp.commands[4]?.params).toMatchObject({
      type: 'keyDown',
      key: 'Enter',
    })
    expect(cdp.commands[6]?.params).toMatchObject({
      type: 'mouseWheel',
      x: 5,
      y: 6,
      deltaY: 120,
    })
  })

  test('evaluates JavaScript in the local browser target', async () => {
    class EvalCdp extends FakeCdp {
      override async send<T = unknown>(
        method: string,
        params: Record<string, unknown> = {},
      ): Promise<T> {
        this.commands.push({ method, params })
        return { result: { value: 'ok' } } as T
      }
    }
    const cdp = new EvalCdp()
    const target = new CdpComputerUseTarget(cdp, {
      displayWidth: 1024,
      displayHeight: 768,
    })

    expect(await target.evaluate('document.body.dataset.clicked')).toBe('ok')
    expect(cdp.commands[0]).toEqual({
      method: 'Runtime.evaluate',
      params: {
        expression: 'document.body.dataset.clicked',
        returnByValue: true,
        awaitPromise: true,
      },
    })
  })

  test('normalizes common computer action aliases', () => {
    expect(normalizeComputerAction({ type: 'left_click', x: 1, y: 2 })).toEqual(
      { type: 'click', x: 1, y: 2 },
    )
    expect(normalizeComputerAction({ type: 'keypress', keys: 'ENTER' })).toEqual(
      { type: 'keypress', keys: ['ENTER'] },
    )
  })
})
