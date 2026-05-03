#!/usr/bin/env bun
import { serve } from 'bun'
import { existsSync } from 'fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const root = process.cwd()
const realRoot = await realpath(root)
const textFixture = await readFile(
  join(root, 'tests/fixtures/codex-stream/text.sse'),
  'utf8',
)

const tempHome = await mkdtemp(join(tmpdir(), 'chimera-turn-smoke-'))
const codexConfigDir = join(tempHome, 'chimera')
const authPath = join(tempHome, 'chimera/codex/auth.json')
const requests = []

const server = serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    if (!url.pathname.includes('/codex/responses')) {
      return new Response('not found', { status: 404 })
    }

    requests.push(await req.json().catch(() => ({})))
    return new Response(textFixture, {
      headers: { 'content-type': 'text/event-stream' },
    })
  },
})

const env = {
  ...process.env,
  CLAUBBIT: '1',
  CLAUDE_CONFIG_DIR: codexConfigDir,
  CHIMERA_API_ENDPOINT: new URL('/codex/responses', server.url).toString(),
  CHIMERA_CONFIG_HOME: tempHome,
  CHIMERA_SKIP_VERSION_CHECK: '1',
  COLUMNS: '100',
  HOME: tempHome,
  LINES: '30',
  TERM: 'xterm-256color',
  XDG_CONFIG_HOME: join(tempHome, '.config'),
}

try {
  await writeAuthAndConfig()

  const headless = await runCommand([
    'bun',
    'dist/chimera.js',
    '-p',
    'headless hello',
    '--bare',
    '--tools',
    '',
    '--output-format',
    'text',
  ])
  assert(
    headless.stdout === 'hello from codex\n',
    `unexpected headless output: ${JSON.stringify(headless.stdout)}`,
  )
  assert(headless.stderr === '', `unexpected headless stderr: ${headless.stderr}`)
  assertRequestIncludes('headless hello')
  await assertTranscriptContains('headless hello', 'hello from codex')
  console.log('smoke:codex-turn headless turn ok')

  assert(
    existsSync('/usr/bin/expect'),
    'interactive REPL smoke requires /usr/bin/expect',
  )
  const repl = await runCommand(['/usr/bin/expect', '-c', expectScript()])
  assert(
    repl.stdout.includes('interactive hello'),
    'interactive REPL did not echo submitted prompt',
  )
  assert(
    repl.stdout.includes('hello from codex'),
    'interactive REPL did not render Codex response',
  )
  assert(repl.stderr === '', `unexpected interactive stderr: ${repl.stderr}`)
  assertRequestIncludes('interactive hello')
  await assertTranscriptContains('interactive hello', 'hello from codex')
  console.log('smoke:codex-turn interactive REPL ok')
} finally {
  await server.stop(true)
  await rm(tempHome, { recursive: true, force: true })
}

async function writeAuthAndConfig() {
  await mkdir(dirname(authPath), { recursive: true, mode: 0o700 })
  await writeFile(
    authPath,
    JSON.stringify(
      {
        access_token: 'turn-smoke-access',
        refresh_token: 'turn-smoke-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'turn-smoke-account',
        email: 'turn-smoke@example.com',
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
          [normalizeConfigPath(root)]: trustedProjectConfig(),
          [normalizeConfigPath(realRoot)]: trustedProjectConfig(),
        },
      },
      null,
      2,
    ),
  )
}

function trustedProjectConfig() {
  return {
    hasCompletedProjectOnboarding: true,
    hasTrustDialogAccepted: true,
  }
}

function expectScript() {
  return [
    'set timeout 25',
    'log_user 1',
    'spawn bun dist/chimera.js --bare --tools ""',
    'after 3000',
    'send "interactive hello\\r"',
    'expect {',
    '  -re {hello from.*codex} { }',
    '  timeout { exit 2 }',
    '}',
    'after 500',
    'send "/exit\\r"',
    'expect {',
    '  eof { }',
    '  -re {(Goodbye|See ya|Bye|Catch you later|Resume this session with:)} { }',
    '  timeout { exit 3 }',
    '}',
    'expect eof',
    '',
  ].join('\n')
}

async function runCommand(cmd) {
  const proc = Bun.spawn({
    cmd,
    cwd: root,
    env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    withTimeout(proc.exited, 30_000, `${cmd.join(' ')} timed out`, () =>
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

  return { stdout, stderr }
}

function assertRequestIncludes(value) {
  assert(
    requests.some(request => JSON.stringify(request).includes(value)),
    `mock Codex server did not receive prompt: ${value}`,
  )
}

async function assertTranscriptContains(prompt, responseText) {
  const files = (await walk(codexConfigDir)).filter(file =>
    file.endsWith('.jsonl'),
  )
  assert(files.length > 0, 'no transcript JSONL files were written')

  const entries = []
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      entries.push(JSON.parse(line))
    }
  }

  assert(
    entries.some(entry => JSON.stringify(entry).includes(prompt)),
    `transcript did not contain prompt: ${prompt}`,
  )
  assert(
    entries.some(entry => JSON.stringify(entry).includes(responseText)),
    `transcript did not contain response: ${responseText}`,
  )
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

function normalizeConfigPath(path) {
  return path.replace(/\\/g, '/')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
