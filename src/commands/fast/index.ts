import type { Command } from '../../commands.js'
import { FAST_MODE_MODEL_DISPLAY } from '../../utils/fastMode.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'

const fast = {
  type: 'local-jsx',
  name: 'fast',
  get description() {
    return `Toggle fast mode (${FAST_MODE_MODEL_DISPLAY} only)`
  },
  availability: ['claude-ai', 'console'],
  isEnabled: () => false,
  get isHidden() {
    return true
  },
  argumentHint: '[on|off]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  load: () => import('./fast.js'),
} satisfies Command

export default fast
