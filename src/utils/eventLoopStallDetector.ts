import { logForDebugging } from './debug.js'

let timer: NodeJS.Timeout | undefined

export function startEventLoopStallDetector(thresholdMs = 500): void {
  if (timer) return
  let last = Date.now()
  timer = setInterval(() => {
    const now = Date.now()
    const drift = now - last - thresholdMs
    last = now
    if (drift > thresholdMs) {
      logForDebugging(`Event loop stall detected: ${Math.round(drift)}ms`, {
        level: 'warn',
      })
    }
  }, thresholdMs)
  timer.unref?.()
}

export function stopEventLoopStallDetector(): void {
  if (!timer) return
  clearInterval(timer)
  timer = undefined
}
