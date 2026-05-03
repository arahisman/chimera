import React from 'react'
import { Text } from '../../ink.js'
import type { AgentMemoryScope } from '../../tools/AgentTool/agentMemory.js'

export function SnapshotUpdateDialog(props: {
  agentType: string
  scope: AgentMemoryScope
  snapshotTimestamp: string
  onComplete: (choice: 'merge' | 'keep' | 'replace') => void
  onCancel: () => void
}): React.ReactNode {
  void props
  return <Text>Agent memory snapshot update is not active.</Text>
}

export function buildMergePrompt(agentType: string, scope: AgentMemoryScope): string {
  return `Merge the ${String(scope)} memory snapshot for ${agentType}.`
}

