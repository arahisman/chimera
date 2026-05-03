import type { Command, LocalCommandCall } from '../../types/command.js'
import { getCwd } from '../../utils/cwd.js'
import {
  discoverLocalWorkflows,
  getLocalWorkflowsDir,
} from '../../tools/WorkflowTool/localWorkflowDiscovery.js'

const call: LocalCommandCall = async () => {
  const cwd = getCwd()
  const dir = getLocalWorkflowsDir(cwd)
  const workflows = await discoverLocalWorkflows(cwd)

  if (workflows.length === 0) {
    return {
      type: 'text',
      value: `No local workflows found in ${dir}.\n\nCreate a .md or .json file there to expose it as a workflow command.`,
    }
  }

  return {
    type: 'text',
    value: [
      `Local workflows in ${dir}:`,
      '',
      ...workflows.map(
        workflow =>
          `/${workflow.commandName} - ${workflow.description} (${workflow.path})`,
      ),
    ].join('\n'),
  }
}

const workflows = {
  type: 'local',
  name: 'workflows',
  description: 'List local Chimera workflows',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default workflows
