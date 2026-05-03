import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { createLocalCapabilityTool } from '../localCapabilityTool.js'
import { getPlanFilePath } from '../../utils/plans.js'
import { getCwd } from '../../utils/cwd.js'

const execFileAsync = promisify(execFile)

type Recommendation = 'continue' | 'review' | 'done'

function countCheckboxes(plan: string): {
  completed: number
  remaining: number
} {
  let completed = 0
  let remaining = 0
  for (const line of plan.split(/\r?\n/)) {
    if (/^\s*[-*]\s+\[[xX]\]\s+/.test(line)) completed++
    else if (/^\s*[-*]\s+\[\s\]\s+/.test(line)) remaining++
  }
  return { completed, remaining }
}

async function getChangedFiles(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--short'], {
      cwd,
      maxBuffer: 1024 * 1024,
    })
    return stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.replace(/^..[ ]?/, '').trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function recommend(remaining: number, changedFiles: string[]): Recommendation {
  if (remaining > 0) return 'continue'
  if (changedFiles.length > 0) return 'review'
  return 'done'
}

async function verifyPlanExecution(): Promise<string> {
  const cwd = getCwd()
  const planPath = process.env.CHIMERA_PLAN_PATH || getPlanFilePath()
  let plan = ''
  try {
    plan = await readFile(planPath, 'utf8')
  } catch {
    const changedFiles = await getChangedFiles(cwd)
    return JSON.stringify(
      {
        planPath,
        completed: 0,
        remaining: 0,
        changedFiles,
        recommendation: changedFiles.length > 0 ? 'review' : 'continue',
        note: 'No active plan file was found.',
      },
      null,
      2,
    )
  }

  const { completed, remaining } = countCheckboxes(plan)
  const changedFiles = await getChangedFiles(cwd)
  return JSON.stringify(
    {
      planPath,
      completed,
      remaining,
      changedFiles,
      recommendation: recommend(remaining, changedFiles),
    },
    null,
    2,
  )
}

export const VerifyPlanExecutionTool = createLocalCapabilityTool(
  'VerifyPlanExecution',
  'Verify implementation plan execution against the local plan file and git diff',
  verifyPlanExecution,
)
