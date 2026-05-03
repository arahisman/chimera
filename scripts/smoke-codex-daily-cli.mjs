#!/usr/bin/env bun
import { serve } from 'bun'
import { existsSync } from 'fs'
import { mkdtempSync } from 'fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const root = process.cwd()
const chimeraBin = join(root, 'dist/chimera.js')
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-daily-home-'))
const tempWorkdir = await mkdtemp(join(tmpdir(), 'chimera-daily-work-'))
const codexConfigDir = join(tempHome, 'chimera')
const authPath = join(tempHome, 'chimera/codex/auth.json')
const requests = []

const readPath = join(tempWorkdir, 'readme.daily-smoke.txt')
const writePath = join(tempWorkdir, 'written.daily-smoke.txt')
const editPath = join(tempWorkdir, 'edit.daily-smoke.txt')
const grepPath = join(tempWorkdir, 'grep.daily-smoke.txt')
const globPath = join(tempWorkdir, 'glob.daily-smoke.txt')
const mcpConfigPath = join(tempWorkdir, 'mcp.daily-smoke.json')

const webTls = await createTlsMaterial()
const webServer = serve({
  port: 0,
  tls: {
    cert: await readFile(webTls.certPath, 'utf8'),
    key: await readFile(webTls.keyPath, 'utf8'),
  },
  fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/webfetch.md') {
      return new Response('# Daily WebFetch\n\nWEBFETCH_DAILY_MARKER\n', {
        headers: { 'content-type': 'text/markdown' },
      })
    }
    return new Response('not found', { status: 404 })
  },
})
const webFetchUrl = `https://127.0.0.1:${webServer.port}/webfetch.md`

const textFixture = textSse('hello from codex')
const webFetchSummaryFixture = textSse('webfetch mock summary')

const toolFixtures = {
  'daily read tool': functionCallSse({
    callId: 'call_daily_read',
    name: 'Read',
    arguments: {
      file_path: readPath,
      offset: 1,
      limit: 20,
    },
  }),
  'daily write tool': functionCallSse({
    callId: 'call_daily_write',
    name: 'Write',
    arguments: {
      file_path: writePath,
      content: 'daily write marker\n',
    },
  }),
  'daily glob tool': functionCallSse({
    callId: 'call_daily_glob',
    name: 'Glob',
    arguments: {
      pattern: '*.daily-smoke.txt',
      path: tempWorkdir,
    },
  }),
  'daily grep tool': functionCallSse({
    callId: 'call_daily_grep',
    name: 'Grep',
    arguments: {
      pattern: 'DAILY_GREP_MARKER',
      path: tempWorkdir,
      output_mode: 'content',
      '-B': 0,
      '-A': 0,
      '-C': 0,
      context: 0,
      '-n': true,
      '-i': false,
      head_limit: 5,
      offset: 0,
      multiline: false,
    },
  }),
  'daily todo tool': functionCallSse({
    callId: 'call_daily_todo',
    name: 'TodoWrite',
    arguments: {
      todos: [
        {
          content: 'cover daily cli smoke',
          status: 'in_progress',
          activeForm: 'Covering daily cli smoke',
        },
        {
          content: 'verify daily cli smoke',
          status: 'pending',
          activeForm: 'Verifying daily cli smoke',
        },
      ],
    },
  }),
  'daily webfetch tool': functionCallSse({
    callId: 'call_daily_webfetch',
    name: 'WebFetch',
    arguments: {
      url: webFetchUrl,
      prompt: 'Return the smoke marker.',
    },
  }),
  'daily mcp tool': functionCallSse({
    callId: 'call_daily_mcp',
    name: 'mcp__codexSmoke__ping',
    arguments: {
      message: 'mcp daily smoke',
    },
  }),
}

const editReadFixture = functionCallSse({
  callId: 'call_daily_edit_read',
  name: 'Read',
  arguments: {
    file_path: editPath,
    offset: 1,
    limit: 20,
  },
})
const editFixture = functionCallSse({
  callId: 'call_daily_edit',
  name: 'Edit',
  arguments: {
    file_path: editPath,
    old_string: 'before edit',
    new_string: 'after edit',
    replace_all: false,
  },
})

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
  NODE_TLS_REJECT_UNAUTHORIZED: '0',
  PWD: tempWorkdir,
  TERM: 'xterm-256color',
  XDG_CONFIG_HOME: join(tempHome, '.config'),
}

try {
  assert(existsSync(chimeraBin), 'dist/chimera.js does not exist')
  await writeAuthAndConfig()
  await writeFixtures()

  await runToolScenario({
    prompt: 'daily read tool',
    tools: ['Read'],
    callId: 'call_daily_read',
    toolName: 'Read',
    resultNeedle: 'READ_DAILY_MARKER',
  })

  await runToolScenario({
    prompt: 'daily write tool',
    tools: ['Write'],
    extraArgs: ['--permission-mode', 'acceptEdits'],
    callId: 'call_daily_write',
    toolName: 'Write',
    resultNeedle: 'daily write marker',
  })
  await assertFileContent({
    path: writePath,
    expected: 'daily write marker\n',
    callId: 'call_daily_write',
    label: 'Write',
  })

  await runToolScenario({
    prompt: 'daily edit tool',
    tools: ['Read', 'Edit'],
    extraArgs: ['--permission-mode', 'acceptEdits'],
    callId: 'call_daily_edit',
    toolName: 'Edit',
    resultNeedle: 'has been updated successfully',
  })
  await assertFileContent({
    path: editPath,
    expected: 'after edit\n',
    callId: 'call_daily_edit',
    label: 'Edit',
  })

  await runToolScenario({
    prompt: 'daily glob tool',
    tools: ['Glob'],
    callId: 'call_daily_glob',
    toolName: 'Glob',
    resultNeedle: 'glob.daily-smoke.txt',
  })

  await runToolScenario({
    prompt: 'daily grep tool',
    tools: ['Grep'],
    callId: 'call_daily_grep',
    toolName: 'Grep',
    resultNeedle: 'DAILY_GREP_MARKER',
  })

  await runToolScenario({
    prompt: 'daily todo tool',
    tools: ['TodoWrite'],
    callId: 'call_daily_todo',
    toolName: 'TodoWrite',
    resultNeedle: 'Todos have been modified successfully',
  })

  await runToolScenario({
    prompt: 'daily webfetch tool',
    tools: ['WebFetch'],
    allowedTools: ['WebFetch(domain:127.0.0.1)'],
    extraArgs: [
      '--settings',
      JSON.stringify({
        skipWebFetchPreflight: true,
      }),
    ],
    callId: 'call_daily_webfetch',
    toolName: 'WebFetch',
    resultNeedle: 'webfetch mock summary',
  })

  await runToolScenario({
    prompt: 'daily mcp tool',
    allowedTools: ['mcp__codexSmoke__ping'],
    extraArgs: [
      '--mcp-config',
      mcpConfigPath,
      '--strict-mcp-config',
    ],
    callId: 'call_daily_mcp',
    toolName: 'mcp__codexSmoke__ping',
    resultNeedle: 'mcp pong mcp daily smoke',
  })

  await assertTranscriptContains([
    'daily read tool',
    'call_daily_read',
    'daily write tool',
    'call_daily_write',
    'daily edit tool',
    'call_daily_edit',
    'daily glob tool',
    'call_daily_glob',
    'daily grep tool',
    'call_daily_grep',
    'daily todo tool',
    'call_daily_todo',
    'daily webfetch tool',
    'call_daily_webfetch',
    'daily mcp tool',
    'call_daily_mcp',
  ])

  console.log('smoke:codex-daily-cli tool matrix ok')
} finally {
  await apiServer.stop(true)
  await webServer.stop(true)
  await rm(tempHome, { recursive: true, force: true })
  await rm(tempWorkdir, { recursive: true, force: true })
  await rm(webTls.dir, { recursive: true, force: true })
}

async function runToolScenario({
  prompt,
  tools,
  allowedTools = [],
  extraArgs = [],
  callId,
  toolName,
  resultNeedle,
}) {
  const cmd = [
    'bun',
    chimeraBin,
    '-p',
    prompt,
    '--output-format',
    'text',
    ...(tools ? ['--tools', tools.join(',')] : []),
    ...(allowedTools.length > 0
      ? ['--allowed-tools', allowedTools.join(',')]
      : []),
    ...extraArgs,
  ]
  const result = await runCommand(cmd)
  assert(
    result.stdout === 'hello from codex\n',
    `${prompt}: unexpected stdout ${JSON.stringify(result.stdout)}`,
  )
  assert(result.stderr === '', `${prompt}: unexpected stderr ${result.stderr}`)
  assertToolRoundtrip({
    callId,
    toolName,
    requestNeedle: prompt,
    resultNeedle,
  })
}

function responseForRequest(body) {
  const text = JSON.stringify(body)

  if (hasFunctionCallOutput(body, 'call_daily_edit')) {
    return textFixture
  }
  if (hasFunctionCallOutput(body, 'call_daily_edit_read')) {
    return editFixture
  }
  if (text.includes('function_call_output')) {
    return textFixture
  }

  if (!isMainCodexTurn(text) && text.includes('WEBFETCH_DAILY_MARKER')) {
    return webFetchSummaryFixture
  }

  if (isMainCodexTurn(text) && text.includes('daily edit tool')) {
    return editReadFixture
  }

  for (const [prompt, fixture] of Object.entries(toolFixtures)) {
    if (isMainCodexTurn(text) && text.includes(prompt)) {
      return fixture
    }
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
        access_token: 'daily-smoke-access',
        refresh_token: 'daily-smoke-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'daily-smoke-account',
        email: 'daily-smoke@example.com',
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
        },
      },
      null,
      2,
    ),
  )
}

async function writeFixtures() {
  await writeFile(readPath, 'READ_DAILY_MARKER\n')
  await writeFile(editPath, 'before edit\n')
  await writeFile(grepPath, 'alpha\nDAILY_GREP_MARKER\nomega\n')
  await writeFile(globPath, 'glob marker\n')
  await writeFile(
    mcpConfigPath,
    JSON.stringify(
      {
        mcpServers: {
          codexSmoke: {
            type: 'stdio',
            command: 'bun',
            args: [join(root, 'scripts/mcp-smoke-server.mjs')],
          },
        },
      },
      null,
      2,
    ),
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
    withTimeout(proc.exited, 60_000, `${cmd.join(' ')} timed out`, () =>
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
    return hasFunctionCallOutput(request, callId)
  })
  assert(resultRequest, `no function_call_output request for ${callId}`)
  const resultText = JSON.stringify(resultRequest)
  assert(
    resultText.includes(toolName),
    `function_call_output request did not preserve ${toolName} call history`,
  )
  assert(
    resultText.includes(resultNeedle),
    `function_call_output request did not contain tool result: ${resultNeedle}\n${resultText.slice(0, 4000)}`,
  )
  assert(
    !resultText.includes('InputValidationError'),
    `${toolName} produced an input validation error\n${resultText.slice(0, 4000)}`,
  )
  assert(
    !resultText.includes("haven't granted"),
    `${toolName} hit a permission prompt instead of executing`,
  )
  assert(
    !resultText.includes('Permission to'),
    `${toolName} hit a permission denial instead of executing`,
  )
}

async function assertFileContent({ path, expected, callId, label }) {
  let actual
  try {
    actual = await readFile(path, 'utf8')
  } catch (error) {
    throw new Error(
      `${label} did not create ${path}\n${formatResultRequest(callId)}\n${error}`,
    )
  }
  if (actual !== expected) {
    throw new Error(
      `${label} wrote unexpected content to ${path}: ${JSON.stringify(actual)}\n${formatResultRequest(callId)}`,
    )
  }
}

function formatResultRequest(callId) {
  const request = requests.find(item => hasFunctionCallOutput(item, callId))
  return request
    ? `function_call_output request:\n${JSON.stringify(request, null, 2).slice(0, 4000)}`
    : `no function_call_output request found for ${callId}`
}

function hasFunctionCallOutput(body, callId) {
  const input = Array.isArray(body?.input) ? body.input : []
  return input.some(
    item => item?.type === 'function_call_output' && item.call_id === callId,
  )
}

async function assertTranscriptContains(needles) {
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
  for (const needle of needles) {
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

async function createTlsMaterial() {
  const dir = mkdtempSync(join(tmpdir(), 'chimera-webfetch-tls-'))
  const certPath = join(dir, 'cert.pem')
  const keyPath = join(dir, 'key.pem')
  const proc = Bun.spawn({
    cmd: [
      'openssl',
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
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
      `openssl failed with ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    )
  }
  return { dir, certPath, keyPath }
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
