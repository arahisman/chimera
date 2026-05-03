#!/usr/bin/env bun
import { serve } from 'bun'
import { existsSync } from 'fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'fs/promises'
import { basename, dirname, join } from 'path'
import { tmpdir } from 'os'

const root = process.cwd()
const chimeraBin = join(root, 'dist/chimera.js')
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-session-home-'))
const tempWorkdir = await mkdtemp(join(tmpdir(), 'chimera-session-work-'))
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

  await writeAuthAndConfig(tempHome, tempWorkdir)

  const seed = await runCommand([
    'bun',
    chimeraBin,
    '-p',
    'session seed first prompt marker',
    '--bare',
    '--tools',
    '',
    '--output-format',
    'text',
  ])
  assert(
    seed.stdout === 'session seed response marker\n',
    `unexpected seed stdout: ${JSON.stringify(seed.stdout)}`,
  )
  assert(seed.stderr === '', `unexpected seed stderr: ${seed.stderr}`)
  const sessionId = await findSessionIdContaining(
    'session seed first prompt marker',
  )
  assert(sessionId, 'could not find seeded session id in transcript JSONL')
  console.log('smoke:codex-session-cli seed session ok')

  const resume = await runCommand([
    'bun',
    chimeraBin,
    '-p',
    'post resume prompt marker',
    '--resume',
    sessionId,
    '--bare',
    '--tools',
    '',
    '--output-format',
    'text',
  ])
  assert(
    resume.stdout === 'post resume response marker\n',
    `unexpected resume stdout: ${JSON.stringify(resume.stdout)}`,
  )
  assert(resume.stderr === '', `unexpected /resume stderr: ${resume.stderr}`)
  assertRequestIncludesAll(
    ['session seed first prompt marker', 'post resume prompt marker'],
    '--resume Codex request did not include pre-resume context',
  )
  await assertSessionTranscriptContains(sessionId, [
    'session seed first prompt marker',
    'session seed response marker',
    'post resume prompt marker',
    'post resume response marker',
  ])
  console.log('smoke:codex-session-cli resume ok')

  const compact = await runCommand(
    [
      'bun',
      chimeraBin,
      '-p',
      '/compact',
      '--bare',
      '--tools',
      '',
      '--output-format',
      'stream-json',
      '--verbose',
    ],
    { allowNonZero: true },
  )
  assert(
    compact.stdout.includes('No messages to compact'),
    `/compact did not render the empty-history error:\n${compact.stdout}`,
  )
  assert(compact.stderr === '', `unexpected /compact stderr: ${compact.stderr}`)
  console.log('smoke:codex-session-cli slash compact ok')

  const model = await runCommand([
    'bun',
    chimeraBin,
    '-p',
    'model prompt marker',
    '--model',
    'gpt-5.4-mini',
    '--bare',
    '--tools',
    '',
    '--output-format',
    'text',
  ])
  assert(
    model.stdout === 'model response marker\n',
    `unexpected model stdout: ${JSON.stringify(model.stdout)}`,
  )
  assert(model.stderr === '', `unexpected model stderr: ${model.stderr}`)
  const modelRequest = requests.find(request =>
    JSON.stringify(request).includes('model prompt marker'),
  )
  assert(modelRequest, 'mock Codex server did not receive model prompt marker')
  assert(
    modelRequest.model === 'gpt-5.4-mini',
    `--model gpt-5.4-mini did not reach Codex request: ${modelRequest.model}`,
  )
  console.log('smoke:codex-session-cli explicit model ok')

  const aliasReject = await runCommand(
    [
      'bun',
      chimeraBin,
      '-p',
      'model alias rejection marker',
      '--model',
      'haiku',
      '--bare',
      '--tools',
      '',
      '--output-format',
      'text',
    ],
    { allowNonZero: true },
  )
  assert(aliasReject.exitCode !== 0, '--model haiku unexpectedly exited 0')
  assert(
    aliasReject.stdout.includes('Choose an OpenAI model') ||
      aliasReject.stderr.includes('Choose an OpenAI model'),
    `--model haiku did not show OpenAI model guidance:\nstdout:\n${aliasReject.stdout}\nstderr:\n${aliasReject.stderr}`,
  )
  console.log('smoke:codex-session-cli model alias rejection ok')

  const authError = await runMissingAuthScenario()
  assert(
    authError.exitCode !== 0,
    'missing auth scenario unexpectedly exited 0',
  )
  assert(
    authError.stdout.includes('Not authenticated') &&
      authError.stdout.includes('/login'),
    `missing auth did not show login guidance:\n${authError.stdout}`,
  )
  assert(authError.stderr === '', `unexpected auth stderr: ${authError.stderr}`)
  console.log('smoke:codex-session-cli auth error ok')

  const rateLimit = await runCommand(
    [
      'bun',
      chimeraBin,
      '-p',
      'stream rate limit marker',
      '--bare',
      '--tools',
      '',
      '--output-format',
      'text',
    ],
    { allowNonZero: true },
  )
  assert(rateLimit.exitCode !== 0, 'rate limit scenario unexpectedly exited 0')
  assert(
    rateLimit.stdout.includes('API Error: rate limit reached'),
    `rate limit did not render expected API error:\n${rateLimit.stdout}`,
  )
  assert(
    rateLimit.stderr === '',
    `unexpected rate limit stderr: ${rateLimit.stderr}`,
  )
  console.log('smoke:codex-session-cli rate limit error ok')
} finally {
  await apiServer.stop(true)
  await rm(tempHome, { recursive: true, force: true })
  await rm(tempWorkdir, { recursive: true, force: true })
}

function responseForRequest(body) {
  const text = JSON.stringify(body)
  if (text.includes('stream rate limit marker')) return rateLimitSse()
  if (isMainCodexTurn(text) && text.includes('post resume prompt marker')) {
    return textSse('post resume response marker')
  }
  if (isMainCodexTurn(text) && text.includes('model prompt marker')) {
    return textSse('model response marker')
  }
  if (isMainCodexTurn(text) && text.includes('session seed first prompt marker')) {
    return textSse('session seed response marker')
  }
  return textSse('hello from codex')
}

function isMainCodexTurn(text) {
  return (
    text.includes('currentDate') ||
    text.includes('Current date') ||
    text.includes('CWD:')
  )
}

async function writeAuthAndConfig(home, workdir) {
  const authFile = join(home, 'chimera/codex/auth.json')
  const configDir = join(home, 'chimera')
  await mkdir(dirname(authFile), { recursive: true, mode: 0o700 })
  await writeFile(
    authFile,
    JSON.stringify(
      {
        access_token: 'session-smoke-access',
        refresh_token: 'session-smoke-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'session-smoke-account',
        email: 'session-smoke@example.com',
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )

  await mkdir(configDir, { recursive: true, mode: 0o700 })
  await writeFile(
    join(configDir, '.chimera.json'),
    JSON.stringify(
      {
        theme: 'dark',
        hasCompletedOnboarding: true,
        projects: {
          [normalizeConfigPath(workdir)]: trustedProjectConfig(),
        },
      },
      null,
      2,
    ),
  )
}

async function runMissingAuthScenario() {
  const home = await mkdtemp(join(tmpdir(), 'chimera-missing-auth-home-'))
  const workdir = await mkdtemp(join(tmpdir(), 'chimera-missing-auth-work-'))
  try {
    await writeTrustedConfigOnly(home, workdir)
    return await runCommand(
      [
        'bun',
        chimeraBin,
        '-p',
        'missing auth marker',
        '--bare',
        '--tools',
        '',
        '--output-format',
        'text',
      ],
      {
        allowNonZero: true,
        cwd: workdir,
        env: {
          ...env,
          CLAUDE_CONFIG_DIR: join(home, 'chimera'),
          CHIMERA_CONFIG_HOME: home,
          HOME: home,
          PWD: workdir,
          XDG_CONFIG_HOME: join(home, '.config'),
        },
      },
    )
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(workdir, { recursive: true, force: true })
  }
}

async function writeTrustedConfigOnly(home, workdir) {
  const configDir = join(home, 'chimera')
  await mkdir(configDir, { recursive: true, mode: 0o700 })
  await writeFile(
    join(configDir, '.chimera.json'),
    JSON.stringify(
      {
        theme: 'dark',
        hasCompletedOnboarding: true,
        projects: {
          [normalizeConfigPath(workdir)]: trustedProjectConfig(),
        },
      },
      null,
      2,
    ),
  )
}

async function runCommand(cmd, options = {}) {
  const proc = Bun.spawn({
    cmd,
    cwd: options.cwd ?? tempWorkdir,
    env: options.env ?? env,
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

  if (!options.allowNonZero && exitCode !== 0) {
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

async function findSessionIdContaining(needle) {
  for (const file of (await walk(codexConfigDir)).filter(file =>
    file.endsWith('.jsonl'),
  )) {
    const text = await readFile(file, 'utf8')
    if (text.includes(needle)) {
      return basename(file, '.jsonl')
    }
  }
  return undefined
}

async function assertSessionTranscriptContains(sessionId, needles) {
  const file = (await walk(codexConfigDir)).find(
    path => basename(path) === `${sessionId}.jsonl`,
  )
  assert(file, `could not find transcript for resumed session ${sessionId}`)
  const text = await readFile(file, 'utf8')
  for (const needle of needles) {
    assert(text.includes(needle), `session transcript did not contain ${needle}`)
  }
}

function assertRequestIncludesAll(needles, message) {
  const request = requests.find(item => {
    const text = JSON.stringify(item)
    return needles.every(needle => text.includes(needle))
  })
  assert(request, message)
}

async function walk(dir) {
  const files = []
  let dirents = []
  try {
    dirents = await readdir(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const dirent of dirents) {
    const path = join(dir, dirent.name)
    if (dirent.isDirectory()) files.push(...(await walk(path)))
    else files.push(path)
  }
  return files
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

function rateLimitSse() {
  return [
    'event: codex.rate_limits',
    `data: ${JSON.stringify({
      type: 'codex.rate_limits',
      rate_limits: {
        limit_reached: true,
        primary: { reset_after_seconds: 7 },
      },
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
