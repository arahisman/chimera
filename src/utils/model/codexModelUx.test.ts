import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

function readRuntimeSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8').split(
    '//# sourceMappingURL=',
  )[0]
}

function listRuntimeSourceFiles(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap(entry => {
    const path = join(dir, entry)
    const absPath = join(process.cwd(), path)
    const stat = statSync(absPath)

    if (stat.isDirectory()) {
      return listRuntimeSourceFiles(path)
    }

    return /\.(tsx?|jsx?)$/.test(entry) ? [path] : []
  })
}

describe('Codex model UX wiring', () => {
  test('runtime product UX no longer branches on an OpenAI provider', () => {
    const providerSource = readRuntimeSource('src/services/api/providerMode.ts')
    const onboardingSource = readRuntimeSource('src/projectOnboardingState.ts')
    const permissionRequestSource = readRuntimeSource(
      'src/components/permissions/PermissionRequest.tsx',
    )
    const modelSource = readRuntimeSource('src/utils/model/model.ts')
    const agentSource = readRuntimeSource('src/utils/model/agent.ts')

    expect(providerSource).not.toContain("'anthropic'")
    for (const source of [
      onboardingSource,
      permissionRequestSource,
      modelSource,
      agentSource,
    ]) {
      expect(source).not.toContain('getRuntimeAPIProvider() ===')
      expect(source).not.toContain('getRuntimeAPIProvider() !==')
    }
  })

  test('project onboarding accepts AGENTS.md while keeping CLAUDE.md compatibility', () => {
    const source = readRuntimeSource('src/projectOnboardingState.ts')

    expect(source).toContain("'AGENTS.md'")
    expect(source).toContain("'CLAUDE.md'")
    expect(source).toContain('hasProjectInstructions')
  })

  test('main model helpers default to real OpenAI model ids without resolving OpenAI aliases', () => {
    const source = readRuntimeSource('src/utils/model/model.ts')

    expect(source).toContain("const CODEX_DEFAULT_MODEL = 'gpt-5.5'")
    expect(source).toContain('process.env.CHIMERA_DEFAULT_MODEL')
    expect(source).toContain('process.env.CODEX_CODE_DEFAULT_MODEL')
    expect(source).not.toContain('getRuntimeAPIProvider')
    expect(source).toContain("return normalizedModel")
    expect(source).toContain("return config.label")
  })

  test('model picker is backed by the Codex model registry', () => {
    const source = readRuntimeSource('src/utils/model/modelOptions.ts')

    expect(source).not.toContain('getRuntimeAPIProvider')
    expect(source).toContain('listCodexModels().map')
    expect(source).toContain('getConfiguredExternalModelOptions')
    expect(source).toContain('value: model.id')
    expect(source).toContain('label: model.label')
  })

  test('agent selector defaults to inherit and real OpenAI model ids', () => {
    const agentSource = readRuntimeSource('src/utils/model/agent.ts')
    const selectorSource = readRuntimeSource(
      'src/components/agents/ModelSelector.tsx',
    )

    expect(agentSource).toContain("value: 'inherit'")
    expect(agentSource).toContain('listCodexModels().map')
    expect(agentSource).not.toContain('getRuntimeAPIProvider')
    expect(selectorSource).toContain('initialModel ?? "inherit"')
  })

  test('Codex TUI product copy uses Chimera and OpenAI model language', () => {
    const condensedLogoSource = readRuntimeSource(
      'src/components/LogoV2/CondensedLogo.tsx',
    )
    const fullLogoSource = readRuntimeSource('src/components/LogoV2/LogoV2.tsx')
    const welcomeSource = readRuntimeSource(
      'src/components/LogoV2/WelcomeV2.tsx',
    )
    const pickerSource = readRuntimeSource('src/components/ModelPicker.tsx')
    const opusNoticeSource = readRuntimeSource(
      'src/components/LogoV2/Opus1mMergeNotice.tsx',
    )
    const marketplaceSource = readRuntimeSource(
      'src/hooks/useOfficialMarketplaceNotification.tsx',
    )
    const mainSource = readRuntimeSource('src/main.tsx')

    expect(condensedLogoSource).toContain("const productName = 'Chimera'")
    expect(condensedLogoSource).not.toContain('getRuntimeAPIProvider')
    expect(fullLogoSource).toContain("const productName = 'Chimera'")
    expect(fullLogoSource).not.toContain('getRuntimeAPIProvider')
    expect(welcomeSource).toContain('ChimeraWordmark')
    expect(welcomeSource).not.toContain('getRuntimeAPIProvider')
    expect(pickerSource).toContain('connected external provider models')
    expect(opusNoticeSource).toContain('return false')
    expect(opusNoticeSource).not.toContain('getRuntimeAPIProvider')
    expect(marketplaceSource).toContain('_codexNoop')
    expect(mainSource).toContain('external provider model')
    expect(mainSource).not.toContain("or an alias ('sonnet', 'opus', 'haiku')")
  })

  test('external provider login uses a focused highlighted API-key input', () => {
    const loginSource = readRuntimeSource('src/commands/login/login.tsx')
    const baseTextInputSource = readRuntimeSource(
      'src/components/BaseTextInput.tsx',
    )

    expect(loginSource).toContain('Save API key for {provider.name}')
    expect(loginSource).toContain('borderStyle="round"')
    expect(loginSource).toContain('borderColor="permission"')
    expect(loginSource).toContain('focus={true}')
    expect(loginSource).toContain('showCursor={true}')
    expect(loginSource).toContain('cursorOffset={apiKeyCursorOffset}')
    expect(loginSource).toContain(
      'onChangeCursorOffset={setApiKeyCursorOffset}',
    )
    expect(loginSource).toContain('onIsPastingChange={setIsPastingApiKey}')
    expect(loginSource).toContain('Press Enter to save')
    expect(baseTextInputSource).toContain(
      'props.onPaste && isPasting && key.return',
    )
  })

  test('Chimera spinner verbs use a local product-native word set', () => {
    const spinnerVerbsSource = readRuntimeSource('src/constants/spinnerVerbs.ts')
    const completionVerbsSource = readRuntimeSource(
      'src/constants/turnCompletionVerbs.ts',
    )

    expect(spinnerVerbsSource).toContain('Chimera-native spinner verbs')
    expect(spinnerVerbsSource).toContain("'Chimerizing'")
    expect(spinnerVerbsSource).toContain("'Promptsmithing'")
    expect(spinnerVerbsSource).toContain("'Toolsmithing'")
    expect(spinnerVerbsSource).toContain("'Worktreeing'")
    expect(spinnerVerbsSource).not.toContain('Clauding')
    expect(spinnerVerbsSource).not.toContain('Claude')
    expect(spinnerVerbsSource).not.toContain('Anthropic')

    expect(completionVerbsSource).toContain("'Refactored'")
    expect(completionVerbsSource).toContain("'Transmuted'")
    expect(completionVerbsSource).not.toContain('Claude')
    expect(completionVerbsSource).not.toContain('Anthropic')
  })

  test('Chimera TUI uses terminal-native mascot art and block spinner frames', () => {
    const mascotSource = readRuntimeSource(
      'src/components/LogoV2/ChimeraTerminalMascot.tsx',
    )
    const animatedMascotSource = readRuntimeSource(
      'src/components/LogoV2/AnimatedChimeraTerminalMascot.tsx',
    )
    const condensedLogoSource = readRuntimeSource(
      'src/components/LogoV2/CondensedLogo.tsx',
    )
    const fullLogoSource = readRuntimeSource('src/components/LogoV2/LogoV2.tsx')
    const spinnerComponentSource = readRuntimeSource('src/components/Spinner.tsx')
    const spinnerGlyphSource = readRuntimeSource(
      'src/components/Spinner/SpinnerGlyph.tsx',
    )
    const spinnerSource = readRuntimeSource('src/components/Spinner/utils.ts')
    const figuresSource = readRuntimeSource('src/constants/figures.ts')
    const wordmarkSource = readRuntimeSource(
      'src/components/LogoV2/ChimeraWordmark.tsx',
    )
    const generatorSource = readRuntimeSource(
      'scripts/generate-chimera-terminal-art.mjs',
    )
    const oldTeardropAsterisk = '\u273b'

    expect(mascotSource).toContain('CHIMERA_TERMINAL_MASCOT_SIZES')
    expect(mascotSource).toContain('RUNNING_FRAMES')
    expect(mascotSource).toContain("status: { columns: 8, rows: 3 }")
    expect(mascotSource).toContain("running: { columns: 18, rows: 5 }")
    expect(mascotSource).toContain("welcome: { columns: 18, rows: 7 }")
    expect(mascotSource).toContain("banner: { columns: 18, rows: 7 }")
    expect(mascotSource).toContain('▄████ ██████ ███▟▄')
    expect(mascotSource).toContain('ORANGE_EAR_CELLS')
    expect(mascotSource).toContain('rainbow_orange')
    expect(animatedMascotSource).toContain('AnimatedChimeraTerminalMascot')
    expect(condensedLogoSource).toContain('AnimatedChimeraTerminalMascot')
    expect(condensedLogoSource).toContain('ChimeraTerminalMascot')
    expect(fullLogoSource).toContain('ChimeraTerminalMascot')
    expect(fullLogoSource).toContain('ChimeraWordmark')
    expect(fullLogoSource).not.toContain('renderChimeraBorderWordmark')
    expect(fullLogoSource).not.toContain('v${version}')
    expect(wordmarkSource).toContain("text: 'CHIMERA', color: 'clawd_body'")
    expect(wordmarkSource).toContain("text: 'CODE', color: 'rainbow_orange'")
    expect(wordmarkSource).not.toContain('renderChimeraBorderWordmark')
    expect(wordmarkSource).toContain('renderHalfBlockCell')
    expect(wordmarkSource).toContain("'▀'")
    expect(wordmarkSource).toContain("'▄'")
    expect(wordmarkSource).toContain("'█'")
    expect(figuresSource).toContain("export const TEARDROP_ASTERISK = '▚'")
    expect(spinnerSource).toContain("return ['▚', '▀', '▞', '▄']")
    expect(spinnerSource).not.toContain('✦')
    expect(spinnerSource).not.toContain('✧')
    expect(spinnerComponentSource).toContain('const SPINNER_FRAMES = DEFAULT_CHARACTERS')
    expect(spinnerGlyphSource).toContain('const SPINNER_FRAMES = DEFAULT_CHARACTERS')
    expect(
      listRuntimeSourceFiles('src')
        .filter(path => readRuntimeSource(path).includes(oldTeardropAsterisk)),
    ).toEqual([])
    expect(generatorSource).toContain(
      'docs/assets/chimera-terminal-mascot-reference.png',
    )
    expect(
      existsSync('docs/assets/chimera-terminal-mascot-reference.png'),
    ).toBe(true)
  })

  test('Codex mode suppresses OpenAI-only startup notices and permission copy', () => {
    const onboardingSource = readRuntimeSource('src/projectOnboardingState.ts')
    const permissionRequestSource = readRuntimeSource(
      'src/components/permissions/PermissionRequest.tsx',
    )
    const permissionPromptSource = readRuntimeSource(
      'src/components/permissions/PermissionPrompt.tsx',
    )
    const modelMigrationSource = readRuntimeSource(
      'src/hooks/notifs/useModelMigrationNotifications.tsx',
    )
    const subscriptionNoticeSource = readRuntimeSource(
      'src/hooks/notifs/useCanSwitchToExistingSubscription.tsx',
    )
    const chromeNoticeSource = readRuntimeSource(
      'src/hooks/useChromeExtensionNotification.tsx',
    )
    const npmNoticeSource = readRuntimeSource(
      'src/hooks/notifs/useNpmDeprecationNotification.tsx',
    )
    const rateLimitNoticeSource = readRuntimeSource(
      'src/hooks/notifs/useRateLimitWarningNotification.tsx',
    )

    expect(onboardingSource).toContain("const assistantName = 'Chimera'")
    expect(onboardingSource).not.toContain('getRuntimeAPIProvider')
    expect(permissionRequestSource).toContain("const productName = 'Chimera'")
    expect(permissionRequestSource).toContain("const assistantName = 'Chimera'")
    expect(permissionRequestSource).not.toContain('getRuntimeAPIProvider')
    expect(permissionPromptSource).toContain("const assistantName = 'Chimera'")
    expect(permissionPromptSource).not.toContain('getRuntimeAPIProvider')
    for (const source of [
      modelMigrationSource,
      subscriptionNoticeSource,
      chromeNoticeSource,
      npmNoticeSource,
    ]) {
      expect(source).toContain('_codexNoop')
    }
    expect(rateLimitNoticeSource).toContain('return;')
    expect(rateLimitNoticeSource).not.toContain('getRuntimeAPIProvider')
  })

  test('Codex mode keeps local command and dialog copy on Codex product language', () => {
    const outputStyleSource = readRuntimeSource(
      'src/components/OutputStylePicker.tsx',
    )
    const trustDialogSource = readRuntimeSource(
      'src/components/TrustDialog/TrustDialog.tsx',
    )
    const statsComponentSource = readRuntimeSource('src/components/Stats.tsx')
    const statsCommandSource = readRuntimeSource('src/commands/stats/index.ts')
    const feedbackCommandSource = readRuntimeSource(
      'src/commands/feedback/index.ts',
    )
    const statuslineCommandSource = readRuntimeSource(
      'src/commands/statusline.tsx',
    )
    const installCommandSource = readRuntimeSource('src/commands/install.tsx')
    const insightsCommandSource = readRuntimeSource(
      'src/commands/insights.ts',
    )
    const stickersCommandSource = readRuntimeSource(
      'src/commands/stickers/index.ts',
    )
    const passesCommandSource = readRuntimeSource(
      'src/commands/passes/index.ts',
    )

    expect(outputStyleSource).toContain('DEFAULT_OUTPUT_STYLE_PRODUCT_NAME')
    expect(outputStyleSource).toContain('DEFAULT_OUTPUT_STYLE_ACTOR')
    expect(outputStyleSource).not.toContain(
      'This changes how Chimera communicates with you',
    )
    expect(trustDialogSource).toContain('TRUST_DIALOG_PRODUCT_NAME')
    expect(trustDialogSource).not.toContain("Chimera{\"'\"}ll")
    expect(statsComponentSource).toContain('STATS_PRODUCT_NAME')
    expect(statsCommandSource).toContain(
      'Show your ${productName} usage statistics and activity',
    )
    expect(feedbackCommandSource).toContain(
      'Submit feedback about ${productName}',
    )
    expect(statuslineCommandSource).toContain(
      'Set up ${productName}\'s status line UI',
    )
    expect(installCommandSource).toContain(
      'Install ${INSTALL_PRODUCT_NAME} native build',
    )
    expect(insightsCommandSource).toContain(
      'Generate a report analyzing your ${usageReportProductName} sessions',
    )
    expect(stickersCommandSource).toContain('return true')
    expect(stickersCommandSource).not.toContain('getRuntimeAPIProvider')
    expect(passesCommandSource).toContain('return true')
    expect(passesCommandSource).not.toContain('getRuntimeAPIProvider')
  })

  test('Codex mode rewrites /init guidance away from Chimera-only product copy', () => {
    const initSource = readRuntimeSource('src/commands/init.ts')

    expect(initSource).toContain('function getRuntimeInitPrompt')
    expect(initSource).not.toContain('getRuntimeAPIProvider')
    expect(initSource).toContain(".replaceAll('Chimera', 'Chimera')")
    expect(initSource).toContain(".replaceAll('Chimera', 'the assistant')")
    expect(initSource).toContain('project-local skills')
    expect(initSource).toContain('Browse available plugins with `/plugin`')
  })

  test('Codex mode disables cloud-only Chimera web surfaces', () => {
    const ultraplanSource = readRuntimeSource('src/commands/ultraplan.tsx')
    const ultrareviewSource = readRuntimeSource('src/commands/review.ts')
    const remoteSetupSource = readRuntimeSource(
      'src/commands/remote-setup/index.ts',
    )
    const fastSource = readRuntimeSource('src/commands/fast/index.ts')
    const upgradeSource = readRuntimeSource('src/commands/upgrade/index.ts')
    const thinkbackSource = readRuntimeSource('src/commands/thinkback/index.ts')
    const exitPlanSource = readRuntimeSource(
      'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
    )
    const promptInputSource = readRuntimeSource(
      'src/components/PromptInput/PromptInput.tsx',
    )
    const configSource = readRuntimeSource(
      'src/components/Settings/Config.tsx',
    )

    for (const source of [
      ultraplanSource,
      ultrareviewSource,
      remoteSetupSource,
      fastSource,
      upgradeSource,
      thinkbackSource,
    ]) {
      expect(source).toContain('isEnabled: () => false')
      expect(source).not.toContain('getRuntimeAPIProvider')
    }
    expect(ultraplanSource).toContain(
      'remote web planning is not available in Chimera mode',
    )
    expect(exitPlanSource).toContain('const showUltraplan = false')
    expect(exitPlanSource).not.toContain('getRuntimeAPIProvider')
    expect(promptInputSource).toContain("removeNotification('ultraplan-active')")
    expect(promptInputSource).not.toContain('getRuntimeAPIProvider')
    expect(configSource).toContain('const isCodexRuntime')
    expect(configSource).not.toContain('getRuntimeAPIProvider')
    expect(configSource).toContain(
      "label: isCodexRuntime ? 'Push when the assistant decides'",
    )
    expect(configSource).toContain(
      'process.env.ANTHROPIC_API_KEY && !isRunningOnHomespace() && !isCodexRuntime',
    )
  })
})
