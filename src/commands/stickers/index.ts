import type { Command } from '../../commands.js'

const stickers = {
  type: 'local',
  name: 'stickers',
  description: 'Order Chimera stickers',
  get isHidden() {
    return true
  },
  supportsNonInteractive: false,
  load: () => import('./stickers.js'),
} satisfies Command

export default stickers
