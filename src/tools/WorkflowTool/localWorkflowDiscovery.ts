import { readFile, readdir, stat } from 'fs/promises'
import { basename, extname, join } from 'path'

export type LocalWorkflow = {
  name: string
  commandName: string
  description: string
  path: string
  content: string
  allowedTools?: string[]
}

const WORKFLOW_EXTENSIONS = new Set(['.md', '.json'])

function toCommandName(fileName: string): string {
  const base = basename(fileName, extname(fileName))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `workflow:${base || 'local'}`
}

function withArguments(content: string, args: string): string {
  if (!args.trim()) return content
  if (content.includes('$ARGUMENTS')) {
    return content.replaceAll('$ARGUMENTS', args.trim())
  }
  return `${content.trim()}\n\nArguments: ${args.trim()}`
}

async function readWorkflow(path: string): Promise<LocalWorkflow> {
  const raw = await readFile(path, 'utf8')
  const ext = extname(path).toLowerCase()
  const fallbackName = basename(path, ext)

  if (ext === '.json') {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const prompt =
      typeof parsed.prompt === 'string'
        ? parsed.prompt
        : typeof parsed.content === 'string'
          ? parsed.content
          : raw
    const name = typeof parsed.name === 'string' ? parsed.name : fallbackName
    const description =
      typeof parsed.description === 'string'
        ? parsed.description
        : `Run local workflow ${name}`
    const allowedTools = Array.isArray(parsed.allowedTools)
      ? parsed.allowedTools.filter((tool): tool is string => typeof tool === 'string')
      : undefined
    return {
      name,
      commandName: toCommandName(path),
      description,
      path,
      content: prompt,
      allowedTools,
    }
  }

  const firstHeading = raw.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const name = firstHeading || fallbackName
  return {
    name,
    commandName: toCommandName(path),
    description: `Run local workflow ${name}`,
    path,
    content: raw,
  }
}

export function getLocalWorkflowsDir(cwd: string): string {
  return join(cwd, '.chimera', 'workflows')
}

export async function discoverLocalWorkflows(
  cwd: string,
): Promise<LocalWorkflow[]> {
  const dir = getLocalWorkflowsDir(cwd)
  try {
    const dirStat = await stat(dir)
    if (!dirStat.isDirectory()) return []
    const entries = await readdir(dir, { withFileTypes: true })
    const files = entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .filter(name => WORKFLOW_EXTENSIONS.has(extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b))

    return Promise.all(files.map(file => readWorkflow(join(dir, file))))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export function renderWorkflowPrompt(
  workflow: LocalWorkflow,
  args: string,
): string {
  return withArguments(workflow.content, args)
}
