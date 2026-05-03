#!/usr/bin/env bun
import { serve } from 'bun'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

const root = process.cwd()
const chimeraBin = join(root, 'dist/chimera.js')
const realRoot = await realpath(root)
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-agent-smoke-'))
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
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
  CLAUDE_CONFIG_DIR: codexConfigDir,
  CHIMERA_API_ENDPOINT: new URL('/codex/responses', server.url).toString(),
  CHIMERA_CONFIG_HOME: tempHome,
  CHIMERA_SKIP_VERSION_CHECK: '1',
  COLUMNS: '120',
  HOME: tempHome,
  LINES: '40',
  TERM: 'xterm-256color',
  XDG_CONFIG_HOME: join(tempHome, '.config'),
}

try {
  await writeAuthAndConfig()

  const result = await runCommand([
    'bun',
    chimeraBin,
    '-p',
    'agent parent prompt marker',
    // --bare intentionally stays off: simple mode only exposes Bash/Read/Edit.
    '--tools',
    'Agent',
    '--allowed-tools',
    'Agent',
    '--output-format',
    'text',
  ])

  assert(
    result.stdout === 'agent parent final marker\n',
    `unexpected Agent smoke stdout: ${JSON.stringify(result.stdout)}`,
  )
  assert(result.stderr === '', `unexpected Agent smoke stderr: ${result.stderr}`)
  assertAgentRoundtrip()
  await assertTranscriptContains()
  console.log('smoke:codex-agent sync Agent roundtrip ok')
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
        access_token: 'agent-smoke-access',
        refresh_token: 'agent-smoke-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'agent-smoke-account',
        email: 'agent-smoke@example.com',
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

function responseForRequest(body) {
  const text = JSON.stringify(body)
  if (text.includes('function_call_output') && text.includes('call_agent')) {
    return textSse('agent parent final marker')
  }

  if (
    text.includes('agent child prompt marker') &&
    text.includes('You are an agent for Chimera')
  ) {
    return textSse('agent child response marker')
  }

  if (text.includes('agent parent prompt marker')) {
    return functionCallSse({
      callId: 'call_agent',
      name: 'Agent',
      arguments: {
        description: 'Codex agent smoke',
        prompt:
          'agent child prompt marker: respond with exactly agent child response marker.',
        subagent_type: 'general-purpose',
        run_in_background: false,
      },
    })
  }

  return textSse('unexpected codex agent smoke request')
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

function assertAgentRoundtrip() {
  assert(
    requests.some(request =>
      JSON.stringify(request).includes('agent parent prompt marker'),
    ),
    'mock Codex server did not receive parent prompt',
  )
  assert(
    requests.some(request => {
      const text = JSON.stringify(request)
      return (
        text.includes('agent child prompt marker') &&
        text.includes('You are an agent for Chimera')
      )
    }),
    `mock Codex server did not receive a Chimera subagent request\n${requestSummaries()}`,
  )

  const resultRequest = requests.find(request => {
    const text = JSON.stringify(request)
    return text.includes('function_call_output') && text.includes('call_agent')
  })
  assert(resultRequest, 'no function_call_output request for Agent call')
  const resultText = JSON.stringify(resultRequest)
  assert(
    resultText.includes('Agent'),
    'function_call_output request did not preserve Agent call history',
  )
  assert(
    resultText.includes('agent child response marker'),
    'function_call_output request did not include subagent result',
  )
  assert(
    !resultText.includes('InputValidationError'),
    'function_call_output request included a tool input validation error',
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
  for (const needle of [
    'agent parent prompt marker',
    'call_agent',
    'agent child prompt marker',
    'agent child response marker',
    'agent parent final marker',
  ]) {
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

function functionCallSse({ callId, name, arguments: args }) {
  return [
    'event: response.output_item.added',
    `data: ${JSON.stringify({
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'function_call', call_id: callId, name },
    })}`,
    '',
    'event: response.function_call_arguments.delta',
    `data: ${JSON.stringify({
      type: 'response.function_call_arguments.delta',
      output_index: 0,
      delta: JSON.stringify(args),
    })}`,
    '',
    'event: response.output_item.done',
    `data: ${JSON.stringify({
      type: 'response.output_item.done',
      output_index: 0,
      item: { type: 'function_call', call_id: callId, name },
    })}`,
    '',
    'event: response.completed',
    `data: ${JSON.stringify({
      type: 'response.completed',
      response: { usage: { input_tokens: 2, output_tokens: 5 } },
    })}`,
    '',
  ].join('\n')
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
