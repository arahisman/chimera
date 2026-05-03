#!/usr/bin/env bun
import { serve } from 'bun'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

const root = process.cwd()
const chimeraBin = join(root, 'dist/chimera.js')
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-image-home-'))
const tempWorkdir = await mkdtemp(join(tmpdir(), 'chimera-image-work-'))
const realTempWorkdir = await realpath(tempWorkdir)
const codexConfigDir = join(tempHome, 'chimera')
const authPath = join(tempHome, 'chimera/codex/auth.json')
const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const requests = []

const server = serve({
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
  CHIMERA_API_ENDPOINT: new URL('/codex/responses', server.url).toString(),
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
  await writeAuthAndConfig()

  const input = `${JSON.stringify({
    type: 'user',
    session_id: '',
    message: {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: pngBase64,
          },
        },
        {
          type: 'text',
          text: 'image prompt marker: describe the attached pixel.',
        },
      ],
    },
    parent_tool_use_id: null,
  })}\n`

  const result = await runCommand(
    [
      'bun',
      chimeraBin,
      '-p',
      '--bare',
      '--tools',
      '',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
    ],
    input,
  )

  assert(
    result.stdout.includes('image parent final marker'),
    `stream-json stdout did not include final response:\n${result.stdout}`,
  )
  assert(result.stderr === '', `unexpected image smoke stderr: ${result.stderr}`)
  assertImageRequest()
  await assertTranscriptContains()
  console.log('smoke:codex-image stream-json image roundtrip ok')
} finally {
  await server.stop(true)
  await rm(tempHome, { recursive: true, force: true })
  await rm(tempWorkdir, { recursive: true, force: true })
}

async function writeAuthAndConfig() {
  await mkdir(dirname(authPath), { recursive: true, mode: 0o700 })
  await writeFile(
    authPath,
    JSON.stringify(
      {
        access_token: 'image-smoke-access',
        refresh_token: 'image-smoke-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'image-smoke-account',
        email: 'image-smoke@example.com',
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
}

function responseForRequest(body) {
  const text = JSON.stringify(body)
  if (text.includes('image prompt marker')) {
    return textSse('image parent final marker')
  }

  return textSse('unexpected codex image smoke request')
}

async function runCommand(cmd, stdin) {
  const proc = Bun.spawn({
    cmd,
    cwd: tempWorkdir,
    env,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  proc.stdin.write(stdin)
  proc.stdin.end()

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

  return { stdout, stderr }
}

function assertImageRequest() {
  const request = requests.find(item =>
    JSON.stringify(item).includes('image prompt marker'),
  )
  assert(request, `mock Codex server did not receive image prompt\n${requestSummaries()}`)
  const text = JSON.stringify(request)
  assert(
    text.includes('"type":"input_image"'),
    `Codex request did not contain an input_image part\n${text.slice(0, 4000)}`,
  )
  assert(
    text.includes('data:image/png;base64,'),
    `Codex request did not contain a PNG data URL\n${text.slice(0, 4000)}`,
  )
}

async function assertTranscriptContains() {
  const entries = []
  for (const file of (await walk(codexConfigDir)).filter(file =>
    file.endsWith('.jsonl'),
  )) {
    const text = await readFile(file, 'utf8')
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      entries.push(JSON.parse(line))
    }
  }

  assert(entries.length > 0, 'no transcript JSONL entries were written')
  const transcript = JSON.stringify(entries)
  for (const needle of ['image prompt marker', 'image parent final marker']) {
    assert(transcript.includes(needle), `transcript did not contain ${needle}`)
  }
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

function requestSummaries() {
  return requests
    .map((request, index) => {
      const text = JSON.stringify(request)
      return `request ${index + 1}: ${text.slice(0, 2000)}`
    })
    .join('\n---\n')
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
