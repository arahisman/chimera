#!/usr/bin/env bun
import { serve } from 'bun'
import { existsSync } from 'fs'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const root = process.cwd()
const chimeraBin = join(root, 'dist/chimera.js')
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-web-search-home-'))
const tempWorkdir = await mkdtemp(join(tmpdir(), 'chimera-web-search-work-'))
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
  CLAUDE_CONFIG_DIR: codexConfigDir,
  CHIMERA_API_ENDPOINT: new URL('/codex/responses', server.url).toString(),
  CHIMERA_CONFIG_HOME: tempHome,
  CHIMERA_FEATURE_WEB_SEARCH: 'true',
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

  const result = await runCommand([
    'bun',
    chimeraBin,
    '-p',
    'codex web search smoke',
    '--output-format',
    'text',
    '--add-dir',
    tempWorkdir,
    '--tools',
    'WebSearch',
    '--allowed-tools',
    'WebSearch',
  ])

  assert(
    result.stdout === 'websearch final marker\n',
    `unexpected WebSearch stdout: ${JSON.stringify(result.stdout)}`,
  )
  assert(result.stderr === '', `unexpected WebSearch stderr: ${result.stderr}`)
  assertWebSearchRoundtrip()
  console.log('smoke:codex-web-search OpenAI web_search roundtrip ok')
} finally {
  await server.stop(true)
  await rm(tempHome, { recursive: true, force: true })
  await rm(tempWorkdir, { recursive: true, force: true })
}

function responseForRequest(body) {
  const text = JSON.stringify(body)
  if (hasBuiltinWebSearch(body)) return webSearchSse()
  if (hasFunctionCallOutput(body, 'call_codex_websearch')) return textSse()
  if (isMainCodexTurn(text) && text.includes('codex web search smoke')) {
    return functionCallSse({
      callId: 'call_codex_websearch',
      name: 'WebSearch',
      arguments: {
        query: 'codex web search smoke',
        allowed_domains: ['example.com'],
      },
    })
  }
  return textSse()
}

function assertWebSearchRoundtrip() {
  const toolRequest = requests.find(request =>
    JSON.stringify(request).includes('call_codex_websearch'),
  )
  assert(toolRequest, `main request did not include WebSearch call\n${summaries()}`)
  assert(
    JSON.stringify(toolRequest).includes('"name":"WebSearch"') ||
      JSON.stringify(toolRequest).includes('"name": "WebSearch"'),
    `main request did not expose WebSearch tool\n${summaries()}`,
  )

  const builtinRequest = requests.find(hasBuiltinWebSearch)
  assert(builtinRequest, `no nested OpenAI web_search request\n${summaries()}`)
  assert(
    JSON.stringify(builtinRequest.tools).includes('"type":"web_search"') ||
      JSON.stringify(builtinRequest.tools).includes('"type": "web_search"'),
    `nested request did not include web_search tool\n${JSON.stringify(builtinRequest, null, 2)}`,
  )
  assert(
    JSON.stringify(builtinRequest.include ?? []).includes(
      'web_search_call.action.sources',
    ),
    `nested request did not request sources include\n${JSON.stringify(builtinRequest, null, 2)}`,
  )
  assert(
    JSON.stringify(builtinRequest.tools).includes('example.com'),
    `nested request did not preserve allowed_domains\n${JSON.stringify(builtinRequest, null, 2)}`,
  )

  const resultRequest = requests.find(request =>
    Array.isArray(request.input)
      ? request.input.some(
          item =>
            item.type === 'function_call_output' &&
            item.call_id === 'call_codex_websearch' &&
            String(item.output).includes('https://example.com/source') &&
            String(item.output).includes('REMINDER'),
        )
      : false,
  )
  assert(
    resultRequest,
    `WebSearch function_call_output did not include cited source\n${summaries()}`,
  )
}

async function writeAuthAndConfig() {
  await mkdir(dirname(authPath), { recursive: true, mode: 0o700 })
  await writeFile(
    authPath,
    JSON.stringify(
      {
        access_token: 'web-search-smoke-access',
        refresh_token: 'web-search-smoke-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'web-search-smoke-account',
        email: 'web-search-smoke@example.com',
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

async function runCommand(cmd) {
  const proc = Bun.spawn({
    cmd,
    cwd: root,
    env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const timeout = setTimeout(() => proc.kill('SIGKILL'), 45_000)
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  clearTimeout(timeout)
  assert(
    exitCode === 0,
    `${cmd.join(' ')} exited ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}\nrequests:\n${summaries()}`,
  )
  return { stdout, stderr }
}

function hasBuiltinWebSearch(body) {
  return Array.isArray(body?.tools)
    ? body.tools.some(tool => tool?.type === 'web_search')
    : false
}

function hasFunctionCallOutput(body, callId) {
  return Array.isArray(body.input)
    ? body.input.some(
        item => item.type === 'function_call_output' && item.call_id === callId,
      )
    : false
}

function isMainCodexTurn(text) {
  return (
    text.includes('currentDate') ||
    text.includes('Current date') ||
    text.includes('CWD:')
  )
}

function functionCallSse({ callId, name, arguments: args }) {
  return sse([
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
      response: { usage: { input_tokens: 3, output_tokens: 8 } },
    },
  ])
}

function webSearchSse() {
  return sse([
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'web_search_call', id: 'ws_smoke' },
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        type: 'web_search_call',
        id: 'ws_smoke',
        action: {
          type: 'search',
          sources: [
            {
              title: 'Example Source',
              url: 'https://example.com/source',
            },
          ],
        },
      },
    },
    {
      type: 'response.output_item.added',
      output_index: 1,
      item: { type: 'message', id: 'msg_websearch' },
    },
    {
      type: 'response.output_text.delta',
      output_index: 1,
      delta: 'WebSearch smoke answer.',
    },
    {
      type: 'response.output_item.done',
      output_index: 1,
      item: {
        type: 'message',
        id: 'msg_websearch',
        content: [
          {
            type: 'output_text',
            text: 'WebSearch smoke answer.',
            annotations: [
              {
                type: 'url_citation',
                title: 'Example Source',
                url: 'https://example.com/source',
              },
            ],
          },
        ],
      },
    },
    {
      type: 'response.completed',
      response: { usage: { input_tokens: 6, output_tokens: 12 } },
    },
  ])
}

function textSse() {
  return sse([
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'message', id: 'out_text' },
    },
    {
      type: 'response.output_text.delta',
      output_index: 0,
      delta: 'websearch final marker',
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: { type: 'message', id: 'out_text' },
    },
    {
      type: 'response.completed',
      response: { usage: { input_tokens: 1, output_tokens: 3 } },
    },
  ])
}

function sse(payloads) {
  return (
    payloads
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
  )
}

function summaries() {
  return requests
    .map((request, index) => {
      const input = Array.isArray(request.input) ? request.input : []
      const items = input.map(item => {
        if (item?.type === 'function_call') {
          return `function_call:${item.name}:${item.call_id}`
        }
        if (item?.type === 'function_call_output') {
          return `function_call_output:${item.call_id}:${String(item.output).slice(0, 200)}`
        }
        if (item?.type === 'message') {
          return `message:${JSON.stringify(item.content).slice(0, 120)}`
        }
        return String(item?.type ?? 'unknown')
      })
      const tools = Array.isArray(request.tools)
        ? request.tools.map(tool => tool.type === 'function' ? tool.name : tool.type)
        : []
      return `#${index} tools=${tools.join(',')} items=${items.join('|')}`
    })
    .join('\n')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
