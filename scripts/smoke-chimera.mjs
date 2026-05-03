#!/usr/bin/env bun
import { serve } from 'bun'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const root = process.cwd()
const textFixture = await readFile(
  join(root, 'tests/fixtures/codex-stream/text.sse'),
  'utf8',
)
const toolFixture = await readFile(
  join(root, 'tests/fixtures/codex-stream/tool-call.sse'),
  'utf8',
)

let requestCount = 0
const server = serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    if (!url.pathname.includes('/codex/responses')) {
      return new Response('not found', { status: 404 })
    }

    requestCount += 1
    const body = await req.json().catch(() => ({}))
    const wantsTool = JSON.stringify(body).includes('tool')
    return new Response(wantsTool ? toolFixture : textFixture, {
      headers: { 'content-type': 'text/event-stream' },
    })
  },
})

const tempHome = await mkdtemp(join(tmpdir(), 'chimera-smoke-'))
process.env.CHIMERA_CONFIG_HOME = tempHome
process.env.CHIMERA_API_ENDPOINT = new URL(
  '/codex/responses',
  server.url,
).toString()

console.log(`mock codex server listening on ${server.url}`)

try {
  const authPath = join(tempHome, 'chimera/codex/auth.json')
  await mkdir(dirname(authPath), { recursive: true, mode: 0o700 })
  await writeFile(
    authPath,
    JSON.stringify(
      {
        access_token: 'smoke-access-token',
        refresh_token: 'smoke-refresh-token',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'smoke-account',
        email: 'smoke@example.com',
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )

  const { resetCodexAuthCache } = await import(
    '../src/services/codex/auth/manager.ts'
  )
  const { postCodexResponses } = await import('../src/services/codex/client.ts')
  const { codexToAnthropicEvents } = await import(
    '../src/services/codex/translate/events.ts'
  )
  const { noopCodexLogger } = await import(
    '../src/services/codex/translate/types.ts'
  )

  resetCodexAuthCache()

  const textEvents = await collectEvents(
    await postCodexResponses({
      model: 'gpt-5.4',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'say hello' }],
        },
      ],
      store: false,
      stream: true,
    }),
    codexToAnthropicEvents,
    noopCodexLogger,
  )
  const text = textEvents
    .filter(event => event.type === 'content_block_delta')
    .map(event => ('delta' in event ? event.delta : undefined))
    .filter(delta => delta?.type === 'text_delta')
    .map(delta => delta.text)
    .join('')
  assert(text === 'hello from codex', `unexpected text stream: ${text}`)

  const toolEvents = await collectEvents(
    await postCodexResponses({
      model: 'gpt-5.4',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'tool please' }],
        },
      ],
      store: false,
      stream: true,
    }),
    codexToAnthropicEvents,
    noopCodexLogger,
  )
  assert(
    toolEvents.some(
      event =>
        event.type === 'content_block_start' &&
        event.content_block?.type === 'tool_use' &&
        event.content_block.name === 'Read',
    ),
    'tool stream did not emit Read tool_use',
  )
  assert(
    toolEvents.some(
      event =>
        event.type === 'message_delta' &&
        event.delta?.stop_reason === 'tool_use',
    ),
    'tool stream did not stop for tool_use',
  )
  assert(requestCount === 2, `expected 2 mock requests, got ${requestCount}`)

  console.log('smoke:codex text stream ok')
  console.log('smoke:codex tool-call stream ok')
} finally {
  await server.stop(true)
  await rm(tempHome, { recursive: true, force: true })
}

async function collectEvents(response, codexToAnthropicEvents, log) {
  const events = []
  for await (const event of codexToAnthropicEvents(response.body, {
    messageId: 'msg_smoke',
    model: 'gpt-5.4',
    log,
  })) {
    events.push(event)
  }
  return events
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
