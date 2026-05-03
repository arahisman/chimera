#!/usr/bin/env bun
import { serve } from 'bun'
import { existsSync } from 'fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

const root = process.cwd()
const chimeraBin = join(root, 'dist/chimera.js')
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-experience-home-'))
const tempWorkdir = await mkdtemp(join(tmpdir(), 'chimera-experience-work-'))
const realTempWorkdir = await realpath(tempWorkdir)
const codexConfigDir = join(tempHome, 'chimera')
const requests = []

const apiServer = serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    if (!url.pathname.includes('/codex/responses')) {
      return new Response('not found', { status: 404 })
    }

    const body = await req.json().catch(() => ({}))
    requests.push(body)
    return new Response(responseForRequest(body), {
      headers: { 'content-type': 'text/event-stream' },
    })
  },
})

const env = {
  ...process.env,
  CLAUBBIT: '1',
  CLAUDE_CONFIG_DIR: codexConfigDir,
  CHIMERA_API_ENDPOINT: new URL('/codex/responses', apiServer.url).toString(),
  CHIMERA_CONFIG_HOME: tempHome,
  CHIMERA_SKIP_VERSION_CHECK: '1',
  COLUMNS: '120',
  HOME: tempHome,
  LINES: '40',
  PWD: tempWorkdir,
  TERM: 'xterm-256color',
  XDG_CONFIG_HOME: join(tempHome, '.config'),
}

try {
  assert(existsSync(chimeraBin), 'dist/chimera.js does not exist')
  await writeAuthConfigAndExperienceFiles()

  const styled = await runCommand([
    'bun',
    chimeraBin,
    '-p',
    'experience prompt marker',
    '--tools',
    'Skill',
    '--output-format',
    'text',
  ])
  assert(
    styled.stdout === 'experience response marker\n',
    `unexpected output-style stdout: ${JSON.stringify(styled.stdout)}`,
  )
  assert(styled.stderr === '', `unexpected output-style stderr: ${styled.stderr}`)
  assertRequestIncludesAll(
    'experience prompt marker',
    [
      '# Output Style: codex-teacher',
      'codex output style marker',
      'codex-review',
      'Codex Review Skill',
    ],
    'Codex request did not include output style and Skill tool listing',
  )
  console.log('smoke:codex-experience output style and skill listing ok')

  const slashSkill = await runCommand([
    'bun',
    chimeraBin,
    '-p',
    '/codex-review slash skill argument marker',
    '--tools',
    '',
    '--output-format',
    'text',
  ])
  assert(
    slashSkill.stdout === 'slash skill response marker\n',
    `unexpected slash skill stdout: ${JSON.stringify(slashSkill.stdout)}`,
  )
  assert(
    slashSkill.stderr === '',
    `unexpected slash skill stderr: ${slashSkill.stderr}`,
  )
  assertRequestIncludesAll(
    'slash skill argument marker',
    ['codex local skill body marker', 'slash skill argument marker'],
    'Codex request did not include expanded /codex-review skill content',
  )
  console.log('smoke:codex-experience slash skill ok')
} finally {
  await apiServer.stop(true)
  await rm(tempHome, { recursive: true, force: true })
  await rm(tempWorkdir, { recursive: true, force: true })
}

async function writeAuthConfigAndExperienceFiles() {
  const authFile = join(tempHome, 'chimera/codex/auth.json')
  await mkdir(dirname(authFile), { recursive: true, mode: 0o700 })
  await writeFile(
    authFile,
    JSON.stringify(
      {
        access_token: 'experience-smoke-access',
        refresh_token: 'experience-smoke-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'experience-smoke-account',
        email: 'experience-smoke@example.com',
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )

  await mkdir(codexConfigDir, { recursive: true, mode: 0o700 })
  await writeFile(
    join(codexConfigDir, '.chimera.json'),
    JSON.stringify(
      {
        theme: 'dark',
        hasCompletedOnboarding: true,
        projects: {
          [normalizeConfigPath(tempWorkdir)]: trustedProjectConfig(),
          [normalizeConfigPath(realTempWorkdir)]: trustedProjectConfig(),
        },
      },
      null,
      2,
    ),
  )

  const projectCodexDir = join(tempWorkdir, '.chimera')
  await mkdir(join(projectCodexDir, 'output-styles'), {
    recursive: true,
    mode: 0o700,
  })
  await mkdir(join(projectCodexDir, 'skills/codex-review'), {
    recursive: true,
    mode: 0o700,
  })
  await mkdir(projectCodexDir, {
    recursive: true,
    mode: 0o700,
  })
  await writeFile(
    join(projectCodexDir, 'settings.json'),
    JSON.stringify({ outputStyle: 'codex-teacher' }, null, 2),
  )
  await writeFile(
    join(projectCodexDir, 'output-styles/codex-teacher.md'),
    [
      '---',
      'name: codex-teacher',
      'description: Codex teacher output style',
      'keep-coding-instructions: true',
      '---',
      '',
      'codex output style marker: explain every Codex smoke choice.',
      '',
    ].join('\n'),
  )
  await writeFile(
    join(projectCodexDir, 'skills/codex-review/SKILL.md'),
    [
      '---',
      'name: codex-review',
      'description: codex skill description marker',
      '---',
      '',
      '# Codex Review Skill',
      '',
      'codex local skill body marker',
      '',
      'Arguments: $ARGUMENTS',
      '',
    ].join('\n'),
  )
}

async function runCommand(cmd) {
  const proc = Bun.spawn({
    cmd,
    cwd: tempWorkdir,
    env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    withTimeout(proc.exited, 70_000, `${cmd.join(' ')} timed out`, () =>
      proc.kill(),
    ),
  ])

  if (exitCode !== 0) {
    throw new Error(
      [
        `${cmd.join(' ')} exited ${exitCode}`,
        `stdout:\n${stdout}`,
        `stderr:\n${stderr}`,
      ].join('\n'),
    )
  }

  return { stdout, stderr, exitCode }
}

function responseForRequest(body) {
  const text = JSON.stringify(body)
  if (text.includes('slash skill argument marker')) {
    return textSse('slash skill response marker')
  }
  if (text.includes('experience prompt marker')) {
    return textSse('experience response marker')
  }
  return textSse('hello from codex')
}

function assertRequestIncludesAll(anchor, needles, message) {
  const request = requests.find(item => JSON.stringify(item).includes(anchor))
  assert(request, `mock Codex server did not receive anchor: ${anchor}`)
  const text = JSON.stringify(request)
  for (const needle of needles) {
    assert(
      text.includes(needle),
      `${message}; missing ${needle}\nrequest snippet:\n${text.slice(0, 5000)}`,
    )
  }
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

function textSse(text) {
  return [
    'event: response.output_item.added',
    `data: ${JSON.stringify({
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'message', id: `out_${Math.random().toString(36).slice(2)}` },
    })}`,
    '',
    'event: response.output_text.delta',
    `data: ${JSON.stringify({
      type: 'response.output_text.delta',
      output_index: 0,
      delta: text,
    })}`,
    '',
    'event: response.output_item.done',
    `data: ${JSON.stringify({
      type: 'response.output_item.done',
      output_index: 0,
      item: { type: 'message', id: 'out_text' },
    })}`,
    '',
    'event: response.completed',
    `data: ${JSON.stringify({
      type: 'response.completed',
      response: { usage: { input_tokens: 1, output_tokens: 3 } },
    })}`,
    '',
  ].join('\n')
}

function normalizeConfigPath(path) {
  return path.replace(/\\/g, '/')
}

function trustedProjectConfig() {
  return {
    hasCompletedProjectOnboarding: true,
    hasTrustDialogAccepted: true,
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
