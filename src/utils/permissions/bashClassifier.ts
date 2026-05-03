export const PROMPT_PREFIX = 'prompt:'

export type ClassifierResult = {
  matches: boolean
  matchedDescription?: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export type ClassifierBehavior = 'deny' | 'ask' | 'allow'

export function extractPromptDescription(
  ruleContent: string | undefined,
): string | null {
  if (!ruleContent) return null
  const match = ruleContent.match(/(?:^|[\s(])prompt:\s*([^)]*)/i)
  const description = match?.[1]?.trim()
  return description ? description : null
}

export function createPromptRuleContent(description: string): string {
  return `${PROMPT_PREFIX} ${description.trim()}`
}

export function isClassifierPermissionsEnabled(): boolean {
  return true
}

function collectPromptDescriptions(
  context: unknown,
  key: 'alwaysDenyRules' | 'alwaysAskRules' | 'alwaysAllowRules',
): string[] {
  if (!context || typeof context !== 'object') return []
  const rules = (context as Record<string, unknown>)[key]
  if (!rules || typeof rules !== 'object') return []
  const out: string[] = []
  for (const value of Object.values(rules as Record<string, unknown>)) {
    const entries = Array.isArray(value) ? value : []
    for (const rule of entries) {
      if (typeof rule !== 'string') continue
      const description = extractPromptDescription(rule)
      if (description) out.push(description)
    }
  }
  return [...new Set(out)]
}

export function getBashPromptDenyDescriptions(context: unknown): string[] {
  return collectPromptDescriptions(context, 'alwaysDenyRules')
}

export function getBashPromptAskDescriptions(context: unknown): string[] {
  return collectPromptDescriptions(context, 'alwaysAskRules')
}

export function getBashPromptAllowDescriptions(context: unknown): string[] {
  return collectPromptDescriptions(context, 'alwaysAllowRules')
}

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_./:-]+/gi, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3)
}

function scoreDescription(command: string, description: string): number {
  const normalizedCommand = terms(command).join(' ')
  const normalizedDescription = terms(description).join(' ')
  if (!normalizedCommand || !normalizedDescription) return 0
  if (
    normalizedCommand.includes(normalizedDescription) ||
    normalizedDescription.includes(normalizedCommand)
  ) {
    return 1
  }
  const commandTerms = new Set(terms(command))
  const descriptionTerms = terms(description)
  if (descriptionTerms.length === 0) return 0
  const matches = descriptionTerms.filter(term => commandTerms.has(term)).length
  return matches / descriptionTerms.length
}

export async function classifyBashCommand(
  command: string,
  cwd: string,
  descriptions: string[],
  behavior: ClassifierBehavior,
  signal: AbortSignal,
  _isNonInteractiveSession: boolean,
): Promise<ClassifierResult> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  let best: { description: string; score: number } | undefined
  for (const description of descriptions) {
    const score = Math.max(
      scoreDescription(command, description),
      scoreDescription(`${cwd} ${command}`, description),
    )
    if (!best || score > best.score) best = { description, score }
  }
  if (best && best.score >= 0.6) {
    return {
      matches: true,
      matchedDescription: best.description,
      confidence: best.score >= 0.85 ? 'high' : 'medium',
      reason: `Local ${behavior} rule matched the command prompt description.`,
    }
  }
  return {
    matches: false,
    confidence: 'low',
    reason: 'No local prompt rule was similar enough to the command.',
  }
}

export async function generateGenericDescription(
  command: string,
  specificDescription: string | undefined,
  _signal: AbortSignal,
): Promise<string | null> {
  if (specificDescription?.trim()) return specificDescription.trim()
  const [program, ...rest] = command.trim().split(/\s+/)
  if (!program) return null
  return rest.length
    ? `Run ${program} with ${rest.slice(0, 4).join(' ')}`
    : `Run ${program}`
}
