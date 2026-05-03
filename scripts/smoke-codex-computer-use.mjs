#!/usr/bin/env bun
import { serve } from 'bun'
import { runCodexComputerUseLoop } from '../src/utils/computerUse/codexLoop.ts'
import { createChromeCdpComputerUseTarget } from '../src/utils/computerUse/browserTarget.ts'

const requests = []
let browserHandle

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

try {
  browserHandle = await createChromeCdpComputerUseTarget({
    displayWidth: 1024,
    displayHeight: 768,
    html: `<!doctype html>
      <html>
        <body style="margin:0">
          <button
            id="target"
            onclick="document.body.dataset.clicked = 'yes'"
            style="position:absolute;left:20px;top:20px;width:220px;height:90px"
          >Click me</button>
        </body>
      </html>`,
  })

  const result = await runCodexComputerUseLoop({
    task: 'computer use smoke',
    model: 'gpt-5.4',
    maxTurns: 3,
    postResponses: async (body, options) => {
      const response = await fetch(
        new URL('/codex/responses', server.url).toString(),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            session_id: options?.sessionId ?? 'computer-use-smoke',
          },
          body: JSON.stringify(body),
        },
      )
      return {
        status: response.status,
        headers: response.headers,
        body: response.body,
      }
    },
    target: browserHandle.target,
    safety: {
      deniedDomains: ['evil.example'],
      approveActions: async actions =>
        actions.every(action => action.type !== 'type'),
    },
  })

  assert(result.text === 'computer use final marker', 'unexpected final text')
  assert(result.turns === 2, 'unexpected turn count')
  assert(
    (await browserHandle.target.evaluate('document.body.dataset.clicked')) ===
      'yes',
    'expected real Chrome click action to update DOM',
  )

  const initial = requests[0]
  assert(
    initial?.tools?.some(tool => tool.type === 'computer'),
    'initial request did not include computer tool',
  )
  const followup = requests.find(request =>
    request.input?.some?.(item => item.type === 'computer_call_output'),
  )
  assert(followup, 'no computer_call_output followup request')
  assert(
    JSON.stringify(followup).includes('data:image/png;base64,'),
    'followup did not include screenshot data URL',
  )
  assert(
    JSON.stringify(followup).includes('original'),
    'followup screenshot did not request original detail',
  )

  console.log('smoke:codex-computer-use local loop roundtrip ok')
} finally {
  await browserHandle?.close()
  await server.stop(true)
}

function responseForRequest(body) {
  const hasOutput = body.input?.some?.(
    item => item.type === 'computer_call_output',
  )
  if (hasOutput) return finalTextSse()
  return computerCallSse()
}

function computerCallSse() {
  return sse([
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        type: 'computer_call',
        call_id: 'call_computer_smoke',
        actions: [{ type: 'click', x: 80, y: 60 }],
      },
    },
    {
      type: 'response.completed',
      response: { id: 'resp_computer_smoke_1' },
    },
  ])
}

function finalTextSse() {
  return sse([
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'message', id: 'msg_final' },
    },
    {
      type: 'response.output_text.delta',
      output_index: 0,
      delta: 'computer use final marker',
    },
    {
      type: 'response.completed',
      response: { id: 'resp_computer_smoke_2' },
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

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
