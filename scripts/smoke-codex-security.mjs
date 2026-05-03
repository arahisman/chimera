#!/usr/bin/env bun
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const root = process.cwd()

const sourceChecks = [
  {
    label: 'allow and deny permission flows',
    file: 'scripts/smoke-codex-local-tools.mjs',
    needles: [
      'permission deny tool',
      'permission allow once tool',
      'permission allow always tool',
    ],
  },
  {
    label: 'acceptEdits mode',
    file: 'scripts/smoke-codex-local-tools.mjs',
    needles: ["'--permission-mode', 'acceptEdits'"],
  },
  {
    label: 'ask every time TUI permission prompt',
    file: 'scripts/smoke-codex-tui.mjs',
    needles: ['permission-dialog', 'proceed?'],
  },
  {
    label: 'MCP tool trust',
    file: 'scripts/smoke-codex-daily-cli.mjs',
    needles: ['mcp__codexSmoke__ping', '--strict-mcp-config'],
  },
  {
    label: 'dangerously skip permissions guard',
    file: 'src/setup.ts',
    needles: [
      '--dangerously-skip-permissions cannot be used with root/sudo privileges',
      '--dangerously-skip-permissions can only be used in Docker/sandbox containers',
    ],
  },
  {
    label: 'directory boundary and destructive Bash checks',
    file: 'src/tools/BashTool/pathValidation.ts',
    needles: [
      'Validates all paths are within allowed directories',
      'checkDangerousRemovalPaths',
      'rm -rf /',
    ],
  },
  {
    label: 'Bash injection rejection',
    file: 'src/tools/BashTool/bashPermissions.ts',
    needles: [
      'Ask for permission if command injection is detected',
      "suggestions: [], // Don't suggest saving a potentially dangerous command",
    ],
  },
  {
    label: 'external data and prompt injection warning',
    file: 'src/constants/prompts.ts',
    needles: [
      'Tool results may include data from external sources.',
      'attempt at prompt injection',
    ],
  },
]

for (const check of sourceChecks) {
  const source = readFileSync(join(root, check.file), 'utf8')
  for (const needle of check.needles) {
    assert(
      source.includes(needle),
      `${check.label}: missing ${JSON.stringify(needle)} in ${check.file}`,
    )
  }
  console.log(`security source guard ok: ${check.label}`)
}

const smokeCommands = [
  {
    label: 'local permission matrix',
    cmd: ['bun', 'scripts/smoke-codex-local-tools.mjs'],
  },
  {
    label: 'daily MCP trust matrix',
    cmd: ['bun', 'scripts/smoke-codex-daily-cli.mjs'],
  },
  {
    label: 'interactive ask-every-time permission prompt',
    cmd: ['bun', 'scripts/smoke-codex-tui.mjs'],
    requires: '/usr/bin/expect',
  },
]

for (const smoke of smokeCommands) {
  if (smoke.requires) {
    assert(existsSync(smoke.requires), `${smoke.label} requires ${smoke.requires}`)
  }
  await run(smoke)
}

console.log('smoke:codex-security permission regression suite ok')

async function run({ label, cmd }) {
  const proc = Bun.spawn({
    cmd,
    cwd: root,
    env: process.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const timeoutMs = label.includes('interactive')
    ? 5 * 60_000
    : 90_000
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    withTimeout(proc.exited, timeoutMs, `${label} timed out`, () => proc.kill()),
  ])
  if (exitCode !== 0) {
    throw new Error(
      [
        `${label} failed: ${cmd.join(' ')} exited ${exitCode}`,
        `stdout:\n${stdout.slice(0, 4000)}`,
        `stderr:\n${stderr.slice(0, 4000)}`,
      ].join('\n'),
    )
  }
  process.stdout.write(stdout)
  process.stderr.write(stderr)
}

async function withTimeout(promise, ms, message, onTimeout) {
  let timeout
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout?.()
          reject(new Error(message))
        }, ms)
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
