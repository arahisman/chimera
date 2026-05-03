import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import type { Command } from '../../types/command.js'
import {
  discoverLocalWorkflows,
  renderWorkflowPrompt,
  type LocalWorkflow,
} from './localWorkflowDiscovery.js'

export function createWorkflowCommand(workflow: LocalWorkflow): Command {
  return {
    type: 'prompt',
    name: workflow.commandName,
    description: workflow.description,
    contentLength: workflow.content.length,
    progressMessage: `running ${workflow.name}`,
    source: 'builtin',
    kind: 'workflow',
    allowedTools: workflow.allowedTools,
    async getPromptForCommand(args): Promise<ContentBlockParam[]> {
      return [
        {
          type: 'text',
          text: renderWorkflowPrompt(workflow, args),
        },
      ]
    },
  }
}

export async function getWorkflowCommands(cwd: string): Promise<Command[]> {
  const workflows = await discoverLocalWorkflows(cwd)
  return workflows.map(createWorkflowCommand)
}
