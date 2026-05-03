import type { Command } from '../../commands.js'

const productName = 'Chimera'

const stats = {
  type: 'local-jsx',
  name: 'stats',
  description: `Show your ${productName} usage statistics and activity`,
  load: () => import('./stats.js'),
} satisfies Command

export default stats
