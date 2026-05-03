import type { Command, LocalCommandCall } from '../commands.js'

export const call: LocalCommandCall = async () => ({
  type: 'text',
  value:
    'History snip is disabled in this local Codex build. Use /compact for supported context reduction.',
})

const forceSnip = {
  type: 'local',
  name: 'force-snip',
  description: 'Force a history snip when the experimental snip feature is enabled',
  isHidden: true,
  isEnabled: () => false,
  supportsNonInteractive: true,
  load: async () => ({ call }),
} satisfies Command

export default forceSnip
