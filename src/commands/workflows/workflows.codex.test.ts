import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  discoverLocalWorkflows,
  renderWorkflowPrompt,
} from '../../tools/WorkflowTool/localWorkflowDiscovery.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('local workflow discovery', () => {
  test('loads markdown and json workflows from .chimera/workflows', async () => {
    const root = join(tmpdir(), `chimera-workflows-${Date.now()}`)
    tempRoots.push(root)
    const workflowsDir = join(root, '.chimera', 'workflows')
    mkdirSync(workflowsDir, { recursive: true })
    writeFileSync(
      join(workflowsDir, 'review-plan.md'),
      '# Review Plan\n\nCheck $ARGUMENTS',
      'utf8',
    )
    writeFileSync(
      join(workflowsDir, 'ship.json'),
      JSON.stringify({
        name: 'Ship',
        description: 'Prepare release',
        prompt: 'Ship $ARGUMENTS',
        allowedTools: ['Bash', 'Read'],
      }),
      'utf8',
    )

    const workflows = await discoverLocalWorkflows(root)

    expect(workflows.map(workflow => workflow.commandName)).toEqual([
      'workflow:review-plan',
      'workflow:ship',
    ])
    expect(workflows[0]?.name).toBe('Review Plan')
    expect(workflows[1]?.description).toBe('Prepare release')
    expect(workflows[1]?.allowedTools).toEqual(['Bash', 'Read'])
    expect(renderWorkflowPrompt(workflows[0]!, 'phase 4')).toContain(
      'Check phase 4',
    )
  })
})
