import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { ChimeraTerminalMascot } from './ChimeraTerminalMascot.js'
import { ChimeraWordmark } from './ChimeraWordmark.js'

export function WelcomeV2(): React.ReactNode {
  return (
    <Box flexDirection="column" alignItems="center">
      <ChimeraWordmark />
      <ChimeraTerminalMascot size="banner" />
      <Box marginTop={1}>
        <Text dimColor={true}>v{MACRO.VERSION}</Text>
      </Box>
      <Text dimColor={true}>
        <Text color="claude">{'>'}</Text> AI coding assistant
      </Text>
    </Box>
  )
}
