import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('codex built-in agent identity', () => {
  test('core built-in agents use Chimera identity', () => {
    const forbiddenLegacyIdentity = `Anthropic's ${'off'}${'icial CLI'}`
    const sources = [
      'src/tools/AgentTool/built-in/generalPurposeAgent.ts',
      'src/tools/AgentTool/built-in/exploreAgent.ts',
      'src/tools/AgentTool/built-in/planAgent.ts',
      'src/tools/AgentTool/built-in/statuslineSetup.ts',
    ].map(file => readFileSync(join(process.cwd(), file), 'utf8'))

    for (const source of sources) {
      expect(source).toContain('Chimera')
      expect(source).not.toContain(forbiddenLegacyIdentity)
    }
  })

  test('statusline setup uses ChatGPT subscription vocabulary', () => {
    const prompt = readFileSync(
      join(process.cwd(), 'src/tools/AgentTool/built-in/statuslineSetup.ts'),
      'utf8',
    )

    expect(prompt).toContain('ChatGPT subscription usage limits')
    expect(prompt).toContain('Codex is started with --agent')
    expect(prompt).not.toContain('Claude.ai subscription')
    expect(prompt).not.toContain('Claude is started')
  })

  test('Explore and Plan agents are enabled directly for Chimera', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/tools/AgentTool/builtInAgents.ts'),
      'utf8',
    )

    expect(source).not.toContain('getRuntimeAPIProvider')
    expect(source).toContain('return true')
    expect(source).not.toContain("'tengu_amber_stoat'")
  })

  test('Chimera disables coordinator worker mode by default', () => {
    const featurePolicy = readFileSync(
      join(process.cwd(), 'src/codex/featurePolicy.ts'),
      'utf8',
    )
    const coordinatorMode = readFileSync(
      join(process.cwd(), 'src/coordinator/coordinatorMode.ts'),
      'utf8',
    )

    expect(featurePolicy).toContain('coordinator: false')
    expect(coordinatorMode).not.toContain('getRuntimeAPIProvider')
    expect(coordinatorMode).toContain("isCodexFeatureEnabled('coordinator')")
  })

  test('Agent tool model override schema exposes model ids, not Anthropic aliases', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/tools/AgentTool/AgentTool.tsx'),
      'utf8',
    )

    expect(source).toContain('external provider model')
    expect(source).toContain('openrouter/openai/gpt-5.4')
    expect(source).not.toContain(
      "model: z.enum(['sonnet', 'opus', 'haiku']).optional()",
    )
  })

  test('Codex agent model resolution rejects Anthropic aliases in source', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/utils/model/agent.ts'),
      'utf8',
    )

    expect(source).not.toContain('getRuntimeAPIProvider')
    expect(source).toContain('external provider model')
    expect(source).not.toContain(
      "return selectedModel === 'inherit'\n      ? parentModel\n      : parseUserSpecifiedModel(selectedModel)",
    )
  })
})
