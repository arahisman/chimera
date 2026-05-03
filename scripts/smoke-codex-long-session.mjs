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
import { basename, dirname, join } from 'path'
import { tmpdir } from 'os'

const root = process.cwd()
const chimeraBin = join(root, 'dist/chimera.js')
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-long-home-'))
const tempWorkdir = await mkdtemp(join(tmpdir(), 'chimera-long-work-'))
const realTempWorkdir = await realpath(tempWorkdir)
const codexConfigDir = join(tempHome, 'chimera')
const authPath = join(tempHome, 'chimera/codex/auth.json')
const longReadPath = join(tempWorkdir, 'long-read.txt')
const requests = []
const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

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
  CHIMERA_FEATURE_WEB_SEARCH: 'false',
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
  await writeAuthAndConfig()
  await writeFile(longReadPath, 'LONG_READ_MARKER\n')

  const first = await runPrompt('long turn 01 marker', [
    '--bare',
    '--tools',
    '',
  ])
  assertTextOutput(first, 'long response 01 marker')
  const sessionId = await findSessionIdContaining('long turn 01 marker')
  assert(sessionId, 'could not find long-session transcript id')

  for (let i = 2; i <= 20; i++) {
    const marker = turnMarker(i)
    const result = await runPrompt(marker, [
      '--resume',
      sessionId,
      '--bare',
      '--tools',
      '',
    ])
    assertTextOutput(result, responseMarker(i))
  }

  assertRequestIncludesAll(
    ['long turn 01 marker', 'long turn 20 marker'],
    'turn 20 request did not include long-session history',
  )

  const initialTool = await runPrompt('long read tool prompt marker', [
    '--resume',
    sessionId,
    '--tools',
    'Read',
  ])
  assertTextOutput(initialTool, 'long initial tool final marker')
  assertFunctionOutputIncludes('call_long_read_initial', 'LONG_READ_MARKER')

  const image = await runStreamJson(
    [
      '--resume',
      sessionId,
      '--bare',
      '--tools',
      '',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
    ],
    `${JSON.stringify({
      type: 'user',
      session_id: sessionId,
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
            text: 'long image prompt marker',
          },
        ],
      },
      parent_tool_use_id: null,
    })}\n`,
  )
  assert(
    image.stdout.includes('long image response marker'),
    `image turn did not finish with expected marker:\n${image.stdout}`,
  )
  assertImageRequest()

  const agent = await runPrompt('long agent parent prompt marker', [
    '--resume',
    sessionId,
    '--tools',
    'Agent',
    '--allowed-tools',
    'Agent',
  ])
  assertTextOutput(agent, 'long agent parent final marker')
  assertFunctionOutputIncludes('call_long_agent', 'long agent child response marker')

  const compact = await runPrompt('/compact long compact custom instructions', [
    '--resume',
    sessionId,
    '--bare',
    '--tools',
    '',
    '--output-format',
    'stream-json',
    '--verbose',
  ])
  assert(
    compact.stdout.includes('long compact summary marker') ||
      compact.stdout.includes('Compacted'),
    `/compact did not expose a compact result:\n${compact.stdout}`,
  )

  const postResumeTool = await runPrompt('long post resume tool prompt marker', [
    '--resume',
    sessionId,
    '--tools',
    'Read',
  ])
  assertTextOutput(postResumeTool, 'long post resume tool final marker')
  assertFunctionOutputIncludes('call_long_read_after_resume', 'LONG_READ_MARKER')
  assertRequestIncludesAll(
    ['long compact summary marker', 'long post resume tool prompt marker'],
    'post-compact resume request did not include compact summary context',
  )

  await assertTranscriptContains([
    'long turn 01 marker',
    'long turn 20 marker',
    'long read tool prompt marker',
    'long image prompt marker',
    'long agent parent prompt marker',
    'long agent child response marker',
    'long compact summary marker',
    'long post resume tool prompt marker',
    'long post resume tool final marker',
  ])

  console.log('smoke:codex-long-session session stress ok')
} finally {
  await server.stop(true)
  await rm(tempHome, { recursive: true, force: true })
  await rm(tempWorkdir, { recursive: true, force: true })
}

function responseForRequest(body) {
  const text = JSON.stringify(body)
  const latestText = latestUserText(body)

  if (
    latestText.includes('long agent child prompt marker') &&
    text.includes('You are an agent for Chimera')
  ) {
    return textSse('long agent child response marker')
  }

  if (isMainCodexTurn(text) && latestText.includes('long image prompt marker')) {
    return textSse('long image response marker')
  }

  if (
    latestText.includes('long compact custom instructions') ||
    latestText.includes('create a detailed summary')
  ) {
    return textSse(
      'long compact summary marker: turns, tools, image, and agent were preserved.',
    )
  }

  if (
    isMainCodexTurn(text) &&
    latestText.includes('long post resume tool prompt marker')
  ) {
    if (hasFunctionCallOutput(body, 'call_long_read_after_resume')) {
      return textSse('long post resume tool final marker')
    }
    return functionCallSse({
      callId: 'call_long_read_after_resume',
      name: 'Read',
      arguments: { file_path: longReadPath, offset: 1, limit: 20 },
    })
  }

  if (
    isMainCodexTurn(text) &&
    latestText.includes('long agent parent prompt marker')
  ) {
    if (hasFunctionCallOutput(body, 'call_long_agent')) {
      return textSse('long agent parent final marker')
    }
    return functionCallSse({
      callId: 'call_long_agent',
      name: 'Agent',
      arguments: {
        description: 'Codex long-session agent smoke',
        prompt:
          'long agent child prompt marker: respond with exactly long agent child response marker.',
        subagent_type: 'general-purpose',
        run_in_background: false,
      },
    })
  }

  if (
    isMainCodexTurn(text) &&
    latestText.includes('long read tool prompt marker')
  ) {
    if (hasFunctionCallOutput(body, 'call_long_read_initial')) {
      return textSse('long initial tool final marker')
    }
    return functionCallSse({
      callId: 'call_long_read_initial',
      name: 'Read',
      arguments: { file_path: longReadPath, offset: 1, limit: 20 },
    })
  }

  for (let i = 20; i >= 1; i--) {
    if (isMainCodexTurn(text) && latestText.includes(turnMarker(i))) {
      return textSse(responseMarker(i))
    }
  }

  return textSse('unexpected long-session response')
}

async function writeAuthAndConfig() {
  await mkdir(dirname(authPath), { recursive: true, mode: 0o700 })
  await writeFile(
    authPath,
    JSON.stringify(
      {
        access_token: 'long-session-access',
        refresh_token: 'long-session-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'long-session-account',
        email: 'long-session@example.com',
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

async function runPrompt(prompt, extraArgs = []) {
  return await runCommand([
    'bun',
    chimeraBin,
    '-p',
    prompt,
    '--output-format',
    'text',
    '--add-dir',
    tempWorkdir,
    ...extraArgs,
  ])
}

async function runStreamJson(extraArgs, stdin) {
  return await runCommand(
    ['bun', chimeraBin, '-p', '--add-dir', tempWorkdir, ...extraArgs],
    stdin,
  )
}

async function runCommand(cmd, stdin = '') {
  const proc = Bun.spawn({
    cmd,
    cwd: tempWorkdir,
    env,
    stdin: stdin ? 'pipe' : 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (stdin) {
    proc.stdin.write(stdin)
    proc.stdin.end()
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    withTimeout(proc.exited, 90_000, `${cmd.join(' ')} timed out`, () =>
      proc.kill(),
    ),
  ])

  if (exitCode !== 0) {
    throw new Error(
      [
        `${cmd.join(' ')} exited ${exitCode}`,
        `stdout:\n${stdout}`,
        `stderr:\n${stderr}`,
        `requests:\n${requestSummaries()}`,
      ].join('\n'),
    )
  }

  return { stdout, stderr, exitCode }
}

function assertTextOutput(result, expected) {
  assert(
    result.stdout === `${expected}\n`,
    `unexpected stdout: ${JSON.stringify(result.stdout)}, expected ${expected}`,
  )
  assert(result.stderr === '', `unexpected stderr: ${result.stderr}`)
}

function assertFunctionOutputIncludes(callId, needle) {
  const request = requests.find(item => hasFunctionCallOutput(item, callId))
  assert(request, `no function_call_output request for ${callId}`)
  const output = extractFunctionOutput(request, callId)
  assert(
    String(output).includes(needle),
    `${callId} output did not contain ${needle}:\n${String(output).slice(0, 4000)}`,
  )
}

function assertImageRequest() {
  const request = requests.find(item =>
    JSON.stringify(item).includes('long image prompt marker'),
  )
  assert(request, `mock Codex server did not receive image request\n${requestSummaries()}`)
  const text = JSON.stringify(request)
  assert(
    text.includes('"type":"input_image"'),
    `image request did not contain input_image\n${text.slice(0, 4000)}`,
  )
}

async function findSessionIdContaining(needle) {
  for (const file of (await walk(codexConfigDir)).filter(file =>
    file.endsWith('.jsonl'),
  )) {
    const text = await readFile(file, 'utf8')
    if (text.includes(needle)) return basename(file, '.jsonl')
  }
  return undefined
}

async function assertTranscriptContains(needles) {
  const text = await collectTranscriptText()
  for (const needle of needles) {
    assert(text.includes(needle), `transcript did not contain ${needle}`)
  }
}

async function collectTranscriptText() {
  const parts = []
  for (const file of (await walk(codexConfigDir)).filter(file =>
    file.endsWith('.jsonl'),
  )) {
    parts.push(await readFile(file, 'utf8'))
  }
  assert(parts.length > 0, 'no transcript JSONL files were written')
  return parts.join('\n')
}

function assertRequestIncludesAll(needles, message) {
  const request = requests.find(item => {
    const text = JSON.stringify(item)
    return needles.every(needle => text.includes(needle))
  })
  assert(request, `${message}\n${requestSummaries()}`)
}

function hasFunctionCallOutput(body, callId) {
  const input = Array.isArray(body?.input) ? body.input : []
  return input.some(
    item => item?.type === 'function_call_output' && item.call_id === callId,
  )
}

function extractFunctionOutput(body, callId) {
  const input = Array.isArray(body?.input) ? body.input : []
  return input.find(
    item => item?.type === 'function_call_output' && item.call_id === callId,
  )?.output
}

function isMainCodexTurn(text) {
  return (
    text.includes('currentDate') ||
    text.includes('Current date') ||
    text.includes('CWD:')
  )
}

function latestUserText(body) {
  const input = Array.isArray(body?.input) ? body.input : []
  const messages = input.filter(
    item => item?.type === 'message' && item.role === 'user',
  )
  return JSON.stringify(messages.at(-1)?.content ?? '')
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

function turnMarker(index) {
  return `long turn ${String(index).padStart(2, '0')} marker`
}

function responseMarker(index) {
  return `long response ${String(index).padStart(2, '0')} marker`
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
