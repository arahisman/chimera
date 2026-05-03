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
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const root = process.cwd()
const chimeraBin = join(root, 'dist/chimera.js')
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-local-tools-home-'))
const tempWorkdir = await mkdtemp(join(tmpdir(), 'chimera-local-tools-work-'))
const codexConfigDir = join(tempHome, 'chimera')
const authPath = join(tempHome, 'chimera/codex/auth.json')
const requests = []
const servedResponses = []
const mainTurnCounts = new Map()

const multiEditPath = join(tempWorkdir, 'multi-edit.txt')
const notebookPath = join(tempWorkdir, 'notebook.ipynb')
const lsDir = join(tempWorkdir, 'ls-fixture')
const lsTargetPath = join(lsDir, 'ls-target.txt')
const allowOncePath = join(tempWorkdir, 'allow-once.txt')
const allowAlwaysPath = join(tempWorkdir, 'allow-always.txt')

const textFixture = {
  body: await readFile(join(root, 'tests/fixtures/codex-stream/text.sse'), 'utf8'),
  metadata: { text: 'hello from codex' },
}

const fixtures = {
  'local ls tool': functionCallSse({
    callId: 'call_local_ls',
    name: 'LS',
    arguments: {
      path: lsDir,
    },
  }),
  'local websearch unavailable': functionCallSse({
    callId: 'call_local_websearch',
    name: 'WebSearch',
    arguments: {
      query: 'codex local unavailable smoke',
    },
  }),
  'permission deny tool': functionCallSse({
    callId: 'call_permission_deny',
    name: 'Bash',
    arguments: {
      command: `printf denied > ${shellQuote(join(tempWorkdir, 'deny.txt'))}`,
      description: 'Denied permission smoke',
      timeout: 10_000,
      run_in_background: false,
      dangerouslyDisableSandbox: false,
    },
  }),
  'permission allow once tool': functionCallSse({
    callId: 'call_permission_allow_once',
    name: 'Bash',
    arguments: {
      command: `touch ${shellQuote(allowOncePath)} && printf allow-once`,
      description: 'Allow once permission smoke',
      timeout: 10_000,
      run_in_background: false,
      dangerouslyDisableSandbox: false,
    },
  }),
  'permission allow always tool': functionCallSse({
    callId: 'call_permission_allow_always',
    name: 'Bash',
    arguments: {
      command: `touch ${shellQuote(allowAlwaysPath)} && printf allow-always`,
      description: 'Allow always permission smoke',
      timeout: 10_000,
      run_in_background: false,
      dangerouslyDisableSandbox: false,
    },
  }),
  'schema validation failure tool': functionCallSse({
    callId: 'call_schema_failure',
    name: 'Read',
    arguments: {
      limit: 'not-a-number',
    },
  }),
}

const multiEditReadFixture = functionCallSse({
  callId: 'call_local_multiedit_read',
  name: 'Read',
  arguments: {
    file_path: multiEditPath,
    offset: 1,
    limit: 20,
  },
})
const multiEditFixture = functionCallSse({
  callId: 'call_local_multiedit',
  name: 'MultiEdit',
  arguments: {
    file_path: multiEditPath,
    edits: [
      {
        old_string: 'first marker',
        new_string: 'first changed',
      },
      {
        old_string: 'second marker',
        new_string: 'second changed',
      },
    ],
  },
})

const notebookReadFixture = functionCallSse({
  callId: 'call_local_notebook_read',
  name: 'Read',
  arguments: {
    file_path: notebookPath,
  },
})
const notebookEditFixture = functionCallSse({
  callId: 'call_local_notebook_edit',
  name: 'NotebookEdit',
  arguments: {
    notebook_path: notebookPath,
    cell_id: 'smoke-cell',
    new_source: 'print("NOTEBOOK_EDIT_MARKER")',
    cell_type: 'code',
    edit_mode: 'replace',
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
  CHIMERA_FEATURE_WEB_SEARCH: 'false',
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
  await writeAuthAndConfig()
  await writeFixtures()

  await runToolScenario({
    prompt: 'local multiedit tool',
    tools: ['Read', 'MultiEdit'],
    extraArgs: ['--permission-mode', 'acceptEdits'],
    callId: 'call_local_multiedit',
    toolName: 'MultiEdit',
    resultNeedle: 'first changed',
  })
  await assertFileContent({
    path: multiEditPath,
    expected: 'before\nfirst changed\nmiddle\nsecond changed\nafter\n',
    label: 'MultiEdit',
  })

  await runToolScenario({
    prompt: 'local notebook edit tool',
    tools: ['Read', 'NotebookEdit'],
    extraArgs: ['--permission-mode', 'acceptEdits'],
    callId: 'call_local_notebook_edit',
    toolName: 'NotebookEdit',
    resultNeedle: 'NOTEBOOK_EDIT_MARKER',
  })
  const notebookAfter = JSON.parse(await readFile(notebookPath, 'utf8'))
  assert(
    JSON.stringify(notebookAfter).includes('NOTEBOOK_EDIT_MARKER'),
    'NotebookEdit did not update notebook source',
  )

  await runToolScenario({
    prompt: 'local ls tool',
    tools: ['LS'],
    callId: 'call_local_ls',
    toolName: 'LS',
    resultNeedle: 'ls-target.txt',
  })

  await runToolScenario({
    prompt: 'local websearch unavailable',
    callId: 'call_local_websearch',
    toolName: 'WebSearch',
    resultNeedle: 'No such tool available: WebSearch',
    allowToolError: true,
  })

  await runToolScenario({
    prompt: 'permission deny tool',
    tools: ['Bash'],
    extraArgs: ['--permission-mode', 'dontAsk'],
    callId: 'call_permission_deny',
    toolName: 'Bash',
    resultNeedle: "don't ask mode",
    allowToolError: true,
  })
  assert(
    !existsSync(join(tempWorkdir, 'deny.txt')),
    'permission deny smoke unexpectedly executed denied command',
  )

  const allowOnceCommand =
    fixtures['permission allow once tool'].metadata.arguments.command
  await runToolScenario({
    prompt: 'permission allow once tool',
    tools: ['Bash'],
    allowedTools: [`Bash(${allowOnceCommand})`],
    callId: 'call_permission_allow_once',
    toolName: 'Bash',
    resultNeedle: 'allow-once',
  })
  await assertFileContent({
    path: allowOncePath,
    expected: '',
    label: 'permission allow once',
  })

  const allowAlwaysCommand =
    fixtures['permission allow always tool'].metadata.arguments.command
  await runToolScenario({
    prompt: 'permission allow always tool',
    tools: ['Bash'],
    extraArgs: [
      '--settings',
      JSON.stringify({
        permissions: {
          allow: [`Bash(${allowAlwaysCommand})`],
        },
      }),
    ],
    callId: 'call_permission_allow_always',
    toolName: 'Bash',
    resultNeedle: 'allow-always',
  })
  await assertFileContent({
    path: allowAlwaysPath,
    expected: '',
    label: 'permission allow always',
  })

  await runToolScenario({
    prompt: 'schema validation failure tool',
    tools: ['Read'],
    callId: 'call_schema_failure',
    toolName: 'Read',
    resultNeedle: 'InputValidationError',
    allowToolError: true,
  })

  await assertTranscriptContains([
    'call_local_multiedit',
    'call_local_notebook_read',
    'call_local_notebook_edit',
    'call_local_ls',
    'call_local_websearch',
    'call_permission_deny',
    'call_permission_allow_once',
    'call_permission_allow_always',
    'call_schema_failure',
  ])

  console.log('smoke:codex-local-tools matrix ok')
} finally {
  await apiServer.stop(true)
  await rm(tempHome, { recursive: true, force: true })
  await rm(tempWorkdir, { recursive: true, force: true })
}

async function runToolScenario({
  prompt,
  tools,
  allowedTools = [],
  extraArgs = [],
  callId,
  toolName,
  resultNeedle,
  allowToolError = false,
}) {
  const cmd = [
    'bun',
    chimeraBin,
    '-p',
    prompt,
    '--output-format',
    'text',
    '--add-dir',
    tempWorkdir,
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
    allowToolError,
  })
}

function responseForRequest(body) {
  const text = JSON.stringify(body)

  if (hasFunctionCallOutput(body, 'call_local_multiedit')) {
    return served('local multiedit tool', 'text', textFixture.body)
  }
  if (hasFunctionCallOutput(body, 'call_local_multiedit_read')) {
    return served('local multiedit tool', 'MultiEdit', multiEditFixture.body)
  }
  if (hasFunctionCallOutput(body, 'call_local_notebook_edit')) {
    return served('local notebook edit tool', 'text', textFixture.body)
  }
  if (hasFunctionCallOutput(body, 'call_local_notebook_read')) {
    return served(
      'local notebook edit tool',
      'NotebookEdit',
      notebookEditFixture.body,
    )
  }
  if (text.includes('function_call_output')) {
    return served('function_call_output', 'text', textFixture.body)
  }

  if (isMainCodexTurn(text) && text.includes('local multiedit tool')) {
    const turn = nextMainTurn('local multiedit tool')
    if (turn === 0) {
      return served('local multiedit tool', 'Read', multiEditReadFixture.body)
    }
    if (turn === 1) {
      return served('local multiedit tool', 'MultiEdit', multiEditFixture.body)
    }
    return served('local multiedit tool', 'text', textFixture.body)
  }
  if (isMainCodexTurn(text) && text.includes('local notebook edit tool')) {
    const turn = nextMainTurn('local notebook edit tool')
    if (turn === 0) {
      return served('local notebook edit tool', 'Read', notebookReadFixture.body)
    }
    if (turn === 1) {
      return served(
        'local notebook edit tool',
        'NotebookEdit',
        notebookEditFixture.body,
      )
    }
    return served('local notebook edit tool', 'text', textFixture.body)
  }

  for (const [prompt, fixture] of Object.entries(fixtures)) {
    if (isMainCodexTurn(text) && text.includes(prompt)) {
      const turn = nextMainTurn(prompt)
      return turn === 0
        ? served(prompt, fixture.metadata.name, fixture.body)
        : served(prompt, 'text', textFixture.body)
    }
  }

  return served('fallback', 'text', textFixture.body)
}

function served(prompt, kind, body) {
  servedResponses.push({ prompt, kind })
  return body
}

function nextMainTurn(prompt) {
  const count = mainTurnCounts.get(prompt) ?? 0
  mainTurnCounts.set(prompt, count + 1)
  return count
}

function hasFunctionCallOutput(body, callId) {
  return Array.isArray(body.input)
    ? body.input.some(
        item => item.type === 'function_call_output' && item.call_id === callId,
      )
    : JSON.stringify(body).includes(callId) &&
        JSON.stringify(body).includes('function_call_output')
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
        access_token: 'local-tools-access',
        refresh_token: 'local-tools-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'local-tools-account',
        email: 'local-tools@example.com',
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
          [root]: trustedProjectConfig(),
          [tempWorkdir]: trustedProjectConfig(),
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

async function writeFixtures() {
  await writeFile(
    multiEditPath,
    'before\nfirst marker\nmiddle\nsecond marker\nafter\n',
  )
  await mkdir(lsDir, { recursive: true })
  await writeFile(lsTargetPath, 'ls target marker\n')
  await writeFile(
    notebookPath,
    JSON.stringify(
      {
        cells: [
          {
            cell_type: 'code',
            execution_count: null,
            id: 'smoke-cell',
            metadata: {},
            outputs: [],
            source: ['print("NOTEBOOK_READ_MARKER")'],
          },
        ],
        metadata: {
          language_info: {
            name: 'python',
          },
        },
        nbformat: 4,
        nbformat_minor: 5,
      },
      null,
      2,
    ),
  )
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
  const timeout = setTimeout(() => {
    proc.kill('SIGKILL')
  }, 45_000)

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  clearTimeout(timeout)

  assert(
    exitCode === 0,
    `${cmd.join(' ')} exited ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}\nserved:\n${JSON.stringify(servedResponses, null, 2)}\nrequests:\n${requestSummaries()}`,
  )
  return { stdout, stderr }
}

function assertToolRoundtrip({
  callId,
  toolName,
  requestNeedle,
  resultNeedle,
  allowToolError = false,
}) {
  const toolRequest = requests.find(request =>
    JSON.stringify(request).includes(callId),
  )
  assert(toolRequest, `no request recorded for ${callId}`)
  const toolRequestText = JSON.stringify(toolRequest)
  assert(
    toolRequestText.includes(`"name":"${toolName}"`) ||
      toolRequestText.includes(`"name": "${toolName}"`),
    `${callId}: request did not include tool ${toolName}`,
  )
  assert(
    toolRequestText.includes(requestNeedle),
    `${callId}: request did not include prompt ${requestNeedle}`,
  )

  const resultRequest = requests.find(request =>
    Array.isArray(request.input)
      ? request.input.some(
          item =>
            item.type === 'function_call_output' &&
            item.call_id === callId &&
            String(item.output).includes(resultNeedle),
        )
      : false,
  )
  assert(
    resultRequest,
    `${callId}: no function_call_output included ${JSON.stringify(resultNeedle)}\n${requestSummaries()}`,
  )
  const resultText = JSON.stringify(resultRequest)
  if (!allowToolError) {
    const resultOutput = extractFunctionCallOutput(resultRequest, callId)
    assert(
      !resultText.includes('<tool_use_error>') &&
        !resultText.includes('[tool execution error]') &&
        !resultText.includes("haven't granted") &&
        !resultText.includes('Permission to'),
      `${callId}: tool errored unexpectedly\n${String(resultOutput ?? resultText).slice(0, 5000)}`,
    )
  }
}

function extractFunctionCallOutput(request, callId) {
  const input = Array.isArray(request?.input) ? request.input : []
  const output = input.find(
    item => item?.type === 'function_call_output' && item.call_id === callId,
  )
  return output?.output
}

async function assertTranscriptContains(needles) {
  const transcripts = await collectTranscriptText()
  for (const needle of needles) {
    assert(
      transcripts.includes(needle),
      `transcripts did not contain ${needle}\n${transcripts}`,
    )
  }
}

async function collectTranscriptText() {
  const projectsDir = join(codexConfigDir, 'projects')
  const parts = []
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(
      () => [],
    )) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
      } else if (entry.name.endsWith('.jsonl')) {
        parts.push(await readFile(path, 'utf8'))
      }
    }
  }
  await walk(projectsDir)
  return parts.join('\n')
}

async function assertFileContent({ path, expected, label }) {
  let actual
  try {
    actual = await readFile(path, 'utf8')
  } catch (error) {
    throw new Error(
      `${label}: missing expected file ${path}\n${formatRecentRequest()}\n${error}`,
    )
  }
  assert(
    actual === expected,
    `${label}: unexpected file content ${JSON.stringify(actual)}\n${formatRecentRequest()}`,
  )
}

function formatRecentRequest() {
  const request = requests[requests.length - 1]
  return request
    ? `latest request:\n${JSON.stringify(request, null, 2).slice(0, 5000)}`
    : 'no requests recorded'
}

function functionCallSse({ callId, name, arguments: args }) {
  const body = sse([
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'function_call', call_id: callId, name },
    },
    {
      type: 'response.function_call_arguments.delta',
      output_index: 0,
      delta: JSON.stringify(args),
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: { type: 'function_call', call_id: callId, name },
    },
    {
      type: 'response.completed',
      response: { usage: { input_tokens: 2, output_tokens: 5 } },
    },
  ])
  return { body, metadata: { callId, name, arguments: args } }
}

function sse(payloads) {
  return payloads
    .map(payload => {
      const type =
        typeof payload === 'object' && payload && 'type' in payload
          ? String(payload.type)
          : 'message'
      return [`event: ${type}`, `data: ${JSON.stringify(payload)}`, ''].join(
        '\n',
      )
    })
    .join('\n') + '\n'
}

function requestSummaries() {
  const shownRequests = requests.slice(0, 24)
  const omitted = requests.length - shownRequests.length
  return shownRequests
    .map((request, index) => {
      const input = Array.isArray(request.input) ? request.input : []
      const items = input
        .map(item => {
          if (item?.type === 'function_call') {
            const args = item.arguments
              ? `:${String(item.arguments).slice(0, 160)}`
              : ''
            return `function_call:${item.name}:${item.call_id}${args}`
          }
          if (item?.type === 'function_call_output') {
            return `function_call_output:${item.call_id}:${String(item.output).slice(0, 240)}`
          }
          if (item?.type === 'message') {
            const text = JSON.stringify(item.content ?? '').slice(0, 80)
            return `message:${item.role}:${text}`
          }
          return String(item?.type ?? typeof item)
        })
        .join(', ')
      return `${index}: ${items}`
    })
    .join('\n') + (omitted > 0 ? `\n... ${omitted} more requests` : '')
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
