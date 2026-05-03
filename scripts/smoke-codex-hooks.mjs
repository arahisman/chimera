#!/usr/bin/env bun
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { dirname, isAbsolute, join, resolve } from 'path'
import { tmpdir } from 'os'

const root = process.cwd()
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-hooks-home-'))
const tempWorkdir = await mkdtemp(join(tmpdir(), 'chimera-hooks-work-'))
const tempBuildDir = await mkdtemp(join(tmpdir(), 'chimera-hooks-build-'))
const codexConfigDir = join(tempHome, 'chimera')
const logPath = join(tempBuildDir, 'hook-events.jsonl')
const recorderPath = join(tempBuildDir, 'hook-recorder.mjs')
const runnerPath = join(tempBuildDir, 'hook-runner.mjs')
const bundledRunnerPath = join(tempBuildDir, 'hook-runner.bundle.mjs')

try {
  await writeHookConfigAndRunner()
  await buildRunner()
  await writeBundleFeatureShim()
  await runRunner()
  await assertHookLog()
  console.log('smoke:codex-hooks lifecycle parity ok')
} finally {
  await rm(tempHome, { recursive: true, force: true })
  await rm(tempWorkdir, { recursive: true, force: true })
  await rm(tempBuildDir, { recursive: true, force: true })
}

async function writeBundleFeatureShim() {
  const shimDir = join(tempBuildDir, 'node_modules/bundle')
  await mkdir(shimDir, { recursive: true, mode: 0o700 })
  await writeFile(
    join(shimDir, 'package.json'),
    JSON.stringify({ type: 'module', main: 'index.js' }, null, 2),
  )
  await writeFile(
    join(shimDir, 'index.js'),
    [
      "const ENABLED = new Set(['TOOL_SEARCH', 'TREE_SITTER_BASH', 'VOICE_MODE'])",
      'export function feature(name) {',
      '  const override = process.env[`CHIMERA_BUNDLE_FEATURE_${name}`]',
      "  if (override === 'true') return true",
      "  if (override === 'false') return false",
      '  return ENABLED.has(name)',
      '}',
      '',
    ].join('\n'),
  )
}

async function writeHookConfigAndRunner() {
  await mkdir(codexConfigDir, { recursive: true, mode: 0o700 })
  await mkdir(join(tempWorkdir, '.chimera'), { recursive: true, mode: 0o700 })
  await writeFile(
    join(codexConfigDir, '.chimera.json'),
    JSON.stringify(
      {
        theme: 'dark',
        hasCompletedOnboarding: true,
        projects: {
          [normalizeConfigPath(tempWorkdir)]: {
            hasCompletedProjectOnboarding: true,
            hasTrustDialogAccepted: true,
          },
        },
      },
      null,
      2,
    ),
  )
  await mkdir(join(tempWorkdir, '.chimera'), { recursive: true, mode: 0o700 })
  await writeFile(
    join(tempWorkdir, '.chimera/settings.json'),
    JSON.stringify(
      {
        hooks: hookSettings(),
      },
      null,
      2,
    ),
  )
  await writeFile(
    recorderPath,
    [
      "import { appendFile } from 'fs/promises'",
      '',
      'const [event, logPath] = process.argv.slice(2)',
      'const inputText = await new Response(Bun.stdin.stream()).text()',
      'const input = JSON.parse(inputText)',
      'await appendFile(logPath, JSON.stringify({',
      '  event,',
      '  input,',
      '  env: {',
      '    CHIMERA_CONFIG_HOME: process.env.CHIMERA_CONFIG_HOME,',
      '    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,',
      '    CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR,',
      '  },',
      "}) + '\\n')",
      "console.log(JSON.stringify({ suppressOutput: true }))",
      '',
    ].join('\n'),
  )
  await writeFile(runnerPath, runnerSource())
}

function hookSettings() {
  const hook = event => ({
    type: 'command',
    command: `bun ${shellQuote(recorderPath)} ${shellQuote(event)} ${shellQuote(logPath)}`,
    timeout: 5,
  })
  return {
    SessionStart: [{ matcher: 'startup', hooks: [hook('SessionStart')] }],
    PreToolUse: [{ matcher: 'Bash', hooks: [hook('PreToolUse')] }],
    PostToolUse: [{ matcher: 'Bash', hooks: [hook('PostToolUse')] }],
    Notification: [
      { matcher: 'codex-smoke-notification', hooks: [hook('Notification')] },
    ],
    Stop: [{ hooks: [hook('Stop')] }],
    SubagentStop: [{ matcher: 'general-purpose', hooks: [hook('SubagentStop')] }],
  }
}

function runnerSource() {
  const imports = {
    config: join(root, 'src/utils/config.ts'),
    state: join(root, 'src/bootstrap/state.ts'),
    snapshot: join(root, 'src/utils/hooks/hooksConfigSnapshot.ts'),
    hooks: join(root, 'src/utils/hooks.ts'),
  }

  return `
import { enableConfigs } from ${JSON.stringify(imports.config)}
import { setCwdState, setOriginalCwd } from ${JSON.stringify(imports.state)}
import { captureHooksConfigSnapshot } from ${JSON.stringify(imports.snapshot)}
import {
  executeNotificationHooks,
  executePostToolHooks,
  executePreToolHooks,
  executeSessionStartHooks,
  executeStopHooks,
} from ${JSON.stringify(imports.hooks)}

const [tempWorkdir] = process.argv.slice(2)

enableConfigs()
setOriginalCwd(tempWorkdir)
setCwdState(tempWorkdir)
captureHooksConfigSnapshot()

const abortController = new AbortController()
const appState = {
  sessionHooks: new Map(),
  toolPermissionContext: {
    mode: 'default',
    alwaysAllowRules: { command: [] },
  },
}
const toolUseContext = {
  abortController,
  getAppState() {
    return appState
  },
  options: { tools: [] },
  agentType: 'general-purpose',
}

await drain(executeSessionStartHooks(
  'startup',
  'codex-hook-session',
  'general-purpose',
  'gpt-5.5',
  abortController.signal,
  5000,
  true,
))
await drain(executePreToolHooks(
  'Bash',
  'toolu_codex_hook_pre',
  { command: 'printf hook-pre' },
  toolUseContext,
  'default',
  abortController.signal,
  5000,
))
await drain(executePostToolHooks(
  'Bash',
  'toolu_codex_hook_post',
  { command: 'printf hook-post' },
  { stdout: 'hook-post-output' },
  toolUseContext,
  'default',
  abortController.signal,
  5000,
))
await executeNotificationHooks(
  {
    message: 'Chimera hook smoke notification',
    title: 'Chimera',
    notificationType: 'codex-smoke-notification',
  },
  5000,
)
await drain(executeStopHooks(
  'default',
  abortController.signal,
  5000,
  false,
  undefined,
  toolUseContext,
  [
    {
      type: 'assistant',
      message: {
        id: 'msg_stop',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Chimera stop marker' }],
        model: 'gpt-5.5',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      costUSD: 0,
      durationMs: 1,
      uuid: 'msg_stop_uuid',
      timestamp: new Date().toISOString(),
    },
  ],
  'general-purpose',
))
await drain(executeStopHooks(
  'default',
  abortController.signal,
  5000,
  false,
  'agent-codex-hook-smoke',
  toolUseContext,
  [
    {
      type: 'assistant',
      message: {
        id: 'msg_subagent_stop',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Chimera subagent stop marker' }],
        model: 'gpt-5.5',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      costUSD: 0,
      durationMs: 1,
      uuid: 'msg_subagent_stop_uuid',
      timestamp: new Date().toISOString(),
    },
  ],
  'general-purpose',
))

async function drain(generator) {
  for await (const _ of generator) {
  }
}
`
}

async function buildRunner() {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const missingModuleExports = new Map()
  const result = await Bun.build({
    entrypoints: [runnerPath],
    outdir: tempBuildDir,
    naming: 'hook-runner.bundle.mjs',
    target: 'bun',
    format: 'esm',
    define: {
      'process.env.NODE_ENV': JSON.stringify(
        process.env.NODE_ENV ?? 'development',
      ),
      'process.env.USER_TYPE': JSON.stringify(
        process.env.USER_TYPE ?? 'external',
      ),
      MACRO: JSON.stringify({
        VERSION: packageJson.version,
        BUILD_TIME: process.env.CHIMERA_BUILD_TIME ?? '',
        PACKAGE_URL: 'chimera',
        NATIVE_PACKAGE_URL: 'chimera',
        FEEDBACK_CHANNEL: 'local issue tracker',
        ISSUES_EXPLAINER: 'use /feedback or open an issue in this repository',
        VERSION_CHANGELOG: '',
      }),
    },
    plugins: [
      {
        name: 'codex-hook-smoke-compat-shims',
        setup(build) {
          build.onResolve({ filter: /^(bun:)?bundle$/ }, () => ({
            path: join(root, 'src/build-shims/bun-bundle.ts'),
          }))
          build.onLoad({ filter: /\.(md|txt)$/ }, async args => ({
            contents: await Bun.file(args.path).text(),
            loader: 'text',
          }))
          build.onResolve({ filter: /^(\.|\.\.|src\/)/ }, async args => {
            if (await canResolveSourceModule(args.path, args.importer)) return
            const from = args.importer
              ? args.importer.replace(`${root}/`, '')
              : '<entry>'
            const key = `${args.path} from ${from}`
            missingModuleExports.set(key, collectNamedImports(args.path, args.importer))
            return { path: key, namespace: 'missing-compat-module' }
          })
          build.onLoad(
            { filter: /.*/, namespace: 'missing-compat-module' },
            args => ({
              contents: [
                'const placeholder = new Proxy(function recoveredMissingModulePlaceholder() {}, {',
                '  get: () => placeholder,',
                `  apply: () => { throw new Error(${JSON.stringify(`Recovered source module missing: ${args.path}`)}) },`,
                '})',
                'export default placeholder',
                'export { placeholder }',
                ...((missingModuleExports.get(args.path) ?? []).map(
                  name => `export const ${name} = placeholder`,
                )),
              ].join('\n'),
              loader: 'js',
            }),
          )
        },
      },
    ],
  })
  if (!result.success) {
    throw new Error(result.logs.map(log => String(log)).join('\n'))
  }
}

async function runRunner() {
  const proc = Bun.spawn({
    cmd: ['bun', bundledRunnerPath, tempWorkdir],
    cwd: tempWorkdir,
    env: {
      ...process.env,
      CLAUBBIT: '1',
      CLAUDE_CONFIG_DIR: codexConfigDir,
      CHIMERA_CONFIG_HOME: tempHome,
      CHIMERA_SKIP_VERSION_CHECK: '1',
      HOME: tempHome,
      PWD: tempWorkdir,
      XDG_CONFIG_HOME: join(tempHome, '.config'),
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(
      [
        `hook runner exited ${exitCode}`,
        `stdout:\n${stdout}`,
        `stderr:\n${stderr}`,
      ].join('\n'),
    )
  }
}

async function assertHookLog() {
  const text = await readFile(logPath, 'utf8')
  const entries = text
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
  const byEvent = new Map(entries.map(entry => [entry.event, entry]))
  for (const event of [
    'SessionStart',
    'PreToolUse',
    'PostToolUse',
    'Notification',
    'Stop',
    'SubagentStop',
  ]) {
    assert(byEvent.has(event), `missing hook event ${event}\n${text}`)
  }

  assert(byEvent.get('SessionStart').input.model === 'gpt-5.5', 'SessionStart did not include OpenAI model')
  assert(byEvent.get('PreToolUse').input.tool_name === 'Bash', 'PreToolUse did not include Bash tool name')
  assert(byEvent.get('PostToolUse').input.tool_response.stdout === 'hook-post-output', 'PostToolUse did not include local tool output')
  assert(byEvent.get('Notification').input.title === 'Chimera', 'Notification did not include Chimera title')
  assert(byEvent.get('Stop').input.last_assistant_message === 'Chimera stop marker', 'Stop did not include final assistant text')
  assert(byEvent.get('SubagentStop').input.agent_id === 'agent-codex-hook-smoke', 'SubagentStop did not include subagent id')

  for (const entry of entries) {
    assert(entry.env.CHIMERA_CONFIG_HOME === tempHome, `${entry.event} hook did not see Codex config home`)
    assert(entry.input.cwd === tempWorkdir, `${entry.event} hook cwd was not local workdir`)
    assert(
      entry.input.transcript_path.includes(codexConfigDir),
      `${entry.event} transcript path was not under local config dir: ${entry.input.transcript_path}`,
    )
  }
}

async function canResolveSourceModule(spec, importer) {
  const base = spec.startsWith('src/')
    ? join(root, spec)
    : spec.startsWith('.') && importer
      ? resolve(dirname(importer), spec)
      : undefined
  if (!base) return true
  const noJs = base.endsWith('.js') ? base.slice(0, -3) : base
  const candidates = [
    base,
    `${noJs}.ts`,
    `${noJs}.tsx`,
    `${noJs}.js`,
    `${noJs}.jsx`,
    join(noJs, 'index.ts'),
    join(noJs, 'index.tsx'),
    join(noJs, 'index.js'),
  ]
  return candidates.some(candidate => existsSync(candidate))
}

function collectNamedImports(spec, importer) {
  if (!importer) return []
  let text = ''
  try {
    text = readFileSync(isAbsolute(importer) ? importer : join(root, importer), 'utf8')
  } catch {
    return []
  }
  const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const names = new Set()
  const patterns = [
    new RegExp(`(?:^|\\n)\\s*import\\s+(?:type\\s+)?(?:[\\w$*\\s]+,\\s*)?\\{([^}]*)\\}\\s+from\\s+['"]${escaped}['"]`, 'g'),
    new RegExp(`(?:^|\\n)\\s*export\\s+\\{([^}]*)\\}\\s+from\\s+['"]${escaped}['"]`, 'g'),
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1] ?? ''
      for (const part of raw.split(',')) {
        const cleaned = part.trim().replace(/^type\s+/, '')
        if (!cleaned) continue
        const exported = cleaned.split(/\s+as\s+/i)[0]?.trim()
        if (exported && /^[A-Za-z_$][\w$]*$/.test(exported)) names.add(exported)
      }
    }
  }
  return [...names]
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function normalizeConfigPath(path) {
  return path.replace(/\\/g, '/')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
