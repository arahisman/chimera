import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Box } from '../../ink.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import {
  ChimeraTerminalMascot,
  CHIMERA_TERMINAL_MASCOT_SIZES,
  type ChimeraTerminalMascotSize,
} from './ChimeraTerminalMascot.js'

type Props = {
  size?: ChimeraTerminalMascotSize
}

type Frame = {
  frame: number
  offset: number
}

function hold(frame: number, offset: number, count: number): Frame[] {
  return Array.from({ length: count }, () => ({ frame, offset }))
}

const LOOK_ALIVE: readonly Frame[] = [
  ...hold(0, 0, 4),
  ...hold(1, 0, 2),
  ...hold(2, 0, 2),
  ...hold(1, 0, 2),
  ...hold(0, 0, 3),
]

const LITTLE_HOP: readonly Frame[] = [
  ...hold(0, 1, 2),
  ...hold(1, 0, 2),
  ...hold(2, 0, 2),
  ...hold(0, 0, 3),
]

const CLICK_ANIMATIONS: readonly (readonly Frame[])[] = [LOOK_ALIVE, LITTLE_HOP]
const IDLE: Frame = { frame: 0, offset: 0 }
const FRAME_MS = 85

export function AnimatedChimeraTerminalMascot({
  size = 'status',
}: Props): React.ReactNode {
  const { frame, offset, onClick } = useChimeraMascotAnimation()
  const { rows } = CHIMERA_TERMINAL_MASCOT_SIZES[size]

  return (
    <Box height={rows} flexDirection="column" onClick={onClick}>
      <Box marginTop={offset} flexShrink={0}>
        <ChimeraTerminalMascot size={size} frame={frame} />
      </Box>
    </Box>
  )
}

function useChimeraMascotAnimation(): {
  frame: number
  offset: number
  onClick: () => void
} {
  const [reducedMotion] = useState(
    () => getInitialSettings().prefersReducedMotion ?? false,
  )
  const [frameIndex, setFrameIndex] = useState(-1)
  const sequenceRef = useRef<readonly Frame[]>(LOOK_ALIVE)

  const onClick = () => {
    if (reducedMotion || frameIndex !== -1) return
    sequenceRef.current =
      CLICK_ANIMATIONS[Math.floor(Math.random() * CLICK_ANIMATIONS.length)]!
    setFrameIndex(0)
  }

  useEffect(() => {
    if (frameIndex === -1) return
    if (frameIndex >= sequenceRef.current.length) {
      setFrameIndex(-1)
      return
    }
    const timer = setTimeout(() => setFrameIndex(i => i + 1), FRAME_MS)
    return () => clearTimeout(timer)
  }, [frameIndex])

  const seq = sequenceRef.current
  return frameIndex >= 0 && frameIndex < seq.length ? seq[frameIndex]! : IDLE
}
