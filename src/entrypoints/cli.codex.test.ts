import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('codex cli product wiring', () => {
  test('builds a chimera binary entrypoint', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      bin: Record<string, string>
      scripts: Record<string, string>
    }
    const buildSource = read('scripts/build.mjs')
    const cliSource = read('src/entrypoints/cli.tsx')

    expect(packageJson.bin).toEqual({
      'chimera': './dist/chimera.js',
    })
    expect(packageJson.scripts.start).toContain('dist/chimera.js')
    expect(buildSource).toContain('src/entrypoints/cli.tsx')
    expect(buildSource).toContain('chimera.js')
    expect(buildSource).toContain('CHIMERA_BUILD_TIME')
    expect(cliSource).toContain('process.env.CHIMERA_VERSION ??= MACRO.VERSION')
    expect(cliSource).toContain('`${MACRO.VERSION} (Chimera)`')
  })

  test('registers Codex-facing root commands and hides unrecovered auth flow', () => {
    const mainSource = read('src/main.tsx')

    expect(mainSource).toContain("program.name('chimera')")
    expect(mainSource).toContain('Sign in to your ChatGPT account')
    expect(mainSource).toContain('--device')
    expect(mainSource).toContain("program.command('model [model]')")
    expect(mainSource).toContain("program.command('resume [query]')")
    expect(mainSource).toContain("program.command('permissions')")
    expect(mainSource).toContain('Manage Chimera plugins')
    expect(mainSource).toContain('Check the health of your Chimera installation')
    expect(mainSource).toContain('Install Chimera native build')
    expect(mainSource).not.toContain("program.command('setup-token')")
    expect(mainSource).not.toContain('Set up a long-lived authentication token (requires Claude subscription)')
    expect(mainSource).not.toContain('Enable Claude in Chrome integration')
  })

  test('keeps Codex model defaults visible in command sources', () => {
    const modelCommandSource = read('src/commands/model/index.ts')
    const modelSource = read('src/utils/model/model.ts')
    const registrySource = read('src/services/codex/models/registry.ts')
    const allowlistSource = read('src/services/codex/translate/model-allowlist.ts')

    expect(modelCommandSource).toContain('Set the AI model for Chimera')
    expect(modelSource).toContain("const CODEX_DEFAULT_MODEL = 'gpt-5.5'")
    expect(modelSource).toContain("const CODEX_SMALL_FAST_MODEL = 'gpt-5.4-mini'")
    expect(modelSource).toContain("const CODEX_BEST_MODEL = 'gpt-5.5'")
    for (const model of [
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-5.3-codex',
      'gpt-5.3-codex-spark',
    ]) {
      expect(registrySource).toContain(`id: '${model}'`)
    }
    expect(allowlistSource).toContain('listCodexModels')
    expect(allowlistSource).toContain('isKnownCodexModel')
    expect(allowlistSource).not.toContain("'gpt-5.2'")
  })

  test('registers opt-in live Codex model discovery', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>
    }
    const scriptSource = read('scripts/live-codex-models.mjs')

    expect(packageJson.scripts['live:codex-models']).toBe(
      'CHIMERA_LIVE=1 bun scripts/live-codex-models.mjs',
    )
    expect(scriptSource).toContain('CHIMERA_LIVE')
    expect(scriptSource).toContain('/tmp/chimera-live-models.json')
    for (const classification of [
      'available',
      'unavailable',
      'requires_plan',
      'preview',
      'unknown',
    ]) {
      expect(scriptSource).toContain(classification)
    }
  })
})
