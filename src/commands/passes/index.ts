import type { Command } from '../../commands.js'
import { getCachedReferrerReward } from '../../services/api/referral.js'

export default {
  type: 'local-jsx',
  name: 'passes',
  get description() {
    const reward = getCachedReferrerReward()
    if (reward) {
      return 'Share a free week of Chimera with friends and earn extra usage'
    }
    return 'Share a free week of Chimera with friends'
  },
  get isHidden() {
    return true
  },
  load: () => import('./passes.js'),
} satisfies Command
