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
const readToolFixture = await readFile(
  join(root, 'tests/fixtures/codex-stream/tool-call.sse'),
  'utf8',
)

const tempHome = await mkdtemp(join(tmpdir(), 'chimera-tool-smoke-'))
const codexConfigDir = join(tempHome, 'chimera')
const authPath = join(tempHome, 'chimera/codex/auth.json')
const bashOutputPath = join(root, '.chimera-tool-smoke-output')
const bashCommand = `printf codex-tool-smoke > ${shellQuote(
  bashOutputPath,
)} && cat ${shellQuote(bashOutputPath)}`
const bashToolFixture = functionCallSse({
  callId: 'call_bash',
  name: 'Bash',
  arguments: {
    command: bashCommand,
    description: 'Write and read smoke marker',
    timeout: 10_000,
    run_in_background: false,
    dangerouslyDisableSandbox: false,
  },
})
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
    'headless read tool',
    '--bare',
    '--tools',
    'Read',
    '--allowed-tools',
    'Read',
    '--output-format',
    'text',
  ])
  assert(
    headless.stdout === 'hello from codex\n',
    `unexpected headless output: ${JSON.stringify(headless.stdout)}`,
  )
  assert(headless.stderr === '', `unexpected headless stderr: ${headless.stderr}`)
  assertToolRoundtrip({
    callId: 'call_read',
    toolName: 'Read',
    requestNeedle: 'headless read tool',
    resultNeedle: 'Chimera',
  })
  await assertTranscriptContains({
    prompt: 'headless read tool',
    toolUse: 'call_read',
    toolResult: 'Chimera',
    responseText: 'hello from codex',
  })
  console.log('smoke:codex-tool headless Read roundtrip ok')

  assert(
    existsSync('/usr/bin/expect'),
    'interactive Bash permission smoke requires /usr/bin/expect',
  )
  const repl = await runCommand(['/usr/bin/expect', '-c', expectScript()])
  assert(
    repl.stdout.includes('interactive bash tool'),
    'interactive REPL did not echo submitted prompt',
  )
  assert(
    outputIncludesAll(repl.stdout, ['Bash', 'command']),
    'interactive REPL did not render Bash permission dialog',
  )
  assert(
    repl.stdout.includes('proceed?'),
    'interactive REPL did not render Bash approval prompt',
  )
  assert(
    outputIncludesAll(repl.stdout, ['hello', 'codex']),
    'interactive REPL did not render final Codex response after Bash',
  )
  assert(repl.stderr === '', `unexpected interactive stderr: ${repl.stderr}`)
  const bashOutput = await readFile(bashOutputPath, 'utf8')
  assert(
    bashOutput === 'codex-tool-smoke',
    `unexpected Bash smoke output file: ${JSON.stringify(bashOutput)}`,
  )
  assertToolRoundtrip({
    callId: 'call_bash',
    toolName: 'Bash',
    requestNeedle: 'interactive bash tool',
    resultNeedle: 'codex-tool-smoke',
  })
  await assertTranscriptContains({
    prompt: 'interactive bash tool',
    toolUse: 'call_bash',
    toolResult: 'codex-tool-smoke',
    responseText: 'hello from codex',
  })
  console.log('smoke:codex-tool interactive Bash permission roundtrip ok')
} finally {
  await server.stop(true)
  await rm(tempHome, { recursive: true, force: true })
  await rm(bashOutputPath, { force: true })
}

function responseForRequest(body) {
  const text = JSON.stringify(body)
  if (text.includes('function_call_output')) {
    return textFixture
  }

  if (isMainCodexTurn(text) && text.includes('headless read tool')) {
    return readToolFixture
  }

  if (isMainCodexTurn(text) && text.includes('interactive bash tool')) {
    return bashToolFixture
  }

  return textFixture
}

function isMainCodexTurn(text) {
  return (
    text.includes('currentDate') ||
    text.includes('Current date') ||
    text.includes('CWD:')
  )
}

async function writeAuthAndConfig() {
  await mkdir(dirname(authPath), { recursive: true, mode: 0o700 })
  await writeFile(
    authPath,
    JSON.stringify(
      {
        access_token: 'tool-smoke-access',
        refresh_token: 'tool-smoke-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'tool-smoke-account',
        email: 'tool-smoke@example.com',
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
    'set timeout 35',
    'log_user 1',
    'spawn bun dist/chimera.js --bare --tools "Bash"',
    'after 3000',
    'send "interactive bash tool\\r"',
    'expect {',
    '  -re {proceed\\?} { }',
    '  timeout { exit 2 }',
    '}',
    'send "\\r"',
    'expect {',
    '  -re {hello from codex} { }',
    '  timeout { exit 3 }',
    '}',
    'send "\\003"',
    'after 500',
    'send "\\003"',
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
    withTimeout(proc.exited, 45_000, `${cmd.join(' ')} timed out`, () =>
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

function assertToolRoundtrip({
  callId,
  toolName,
  requestNeedle,
  resultNeedle,
}) {
  const requestWithPrompt = requests.some(request =>
    JSON.stringify(request).includes(requestNeedle),
  )
  assert(
    requestWithPrompt,
    `mock Codex server did not receive prompt: ${requestNeedle}`,
  )

  const resultRequest = requests.find(request => {
    const text = JSON.stringify(request)
    return text.includes('function_call_output') && text.includes(callId)
  })
  assert(resultRequest, `no function_call_output request for ${callId}`)
  const resultText = JSON.stringify(resultRequest)
  assert(
    resultText.includes(toolName),
    `function_call_output request did not preserve ${toolName} call history`,
  )
  assert(
    resultText.includes(resultNeedle),
    `function_call_output request did not contain tool result: ${resultNeedle}`,
  )
  assert(
    !resultText.includes('InputValidationError'),
    'function_call_output request included a tool input validation error',
  )
}

async function assertTranscriptContains({
  prompt,
  toolUse,
  toolResult,
  responseText,
}) {
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
  assert(transcript.includes(prompt), `transcript did not contain ${prompt}`)
  assert(transcript.includes(toolUse), `transcript did not contain ${toolUse}`)
  assert(
    transcript.includes(toolResult),
    `transcript did not contain ${toolResult}`,
  )
  assert(
    transcript.includes(responseText),
    `transcript did not contain ${responseText}`,
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

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function outputIncludesAll(output, needles) {
  const lower = output.toLowerCase()
  return needles.every(needle => lower.includes(needle.toLowerCase()))
}

function normalizeConfigPath(path) {
  return path.replace(/\\/g, '/')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
