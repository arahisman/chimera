#!/usr/bin/env bun
import { writeFile } from 'fs/promises'
import { loadCodexTokens } from '../src/services/codex/auth/token-store.ts'
import { postCodexResponses } from '../src/services/codex/client.ts'
import {
  getCodexModelConfig,
  getDefaultCodexModel,
  normalizeCodexModelId,
} from '../src/services/codex/models/registry.ts'
import { parseSseStream } from '../src/services/codex/translate/sse.ts'

const TRACE_PATH = '/tmp/chimera-live-tool.json'

if (process.env.CHIMERA_LIVE !== '1') {
  console.error('Refusing to run live Codex tool smoke without CHIMERA_LIVE=1.')
  console.error('Run `CHIMERA_LIVE=1 bun scripts/live-codex-tool.mjs` after `chimera login`.')
  process.exit(2)
}

const model = normalizeCodexModelId(
  process.env.CHIMERA_LIVE_MODEL ??
    process.env.CHIMERA_MODEL ??
    getDefaultCodexModel().id,
)
const marker = `live-codex-tool-ok-${Date.now()}`
const trace = {
  generated_at: new Date().toISOString(),
  model,
  function_call_received: false,
  function_call_name: null,
  function_call_argument_keys: [],
  function_call_output_sent: false,
  assistant_completed_after_tool: false,
  sse_event_types: [],
  output_item_types: [],
  response_id_prefixes: [],
  error_type: null,
}

try {
  assert(await loadCodexTokens(), 'Not authenticated. Run `chimera login` before live tool smoke.')
  assert(getCodexModelConfig(model), `live tool model is not in the Codex registry: ${model}`)
  assert(model.startsWith('gpt-'), `live tool model must be a real OpenAI model id: ${model}`)

  const first = await collectTurn(
    {
      model,
      instructions:
        'You are Chimera live tool probe. Use the provided function exactly when asked.',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Call codex_live_echo once with marker "${marker}" and then wait for the tool result.`,
            },
          ],
        },
      ],
      tools: [
        {
          type: 'function',
          name: 'codex_live_echo',
          description: 'Returns the provided marker after local execution.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              marker: { type: 'string' },
            },
            required: ['marker'],
          },
          strict: true,
        },
      ],
      tool_choice: { type: 'function', name: 'codex_live_echo' },
      parallel_tool_calls: false,
      store: false,
      stream: true,
      text: { verbosity: 'low' },
    },
    `live-tool-first-${Date.now()}`,
  )

  assert(first.functionCall, 'upstream did not return a function_call')
  assert(
    first.functionCall.name === 'codex_live_echo',
    `unexpected function call: ${first.functionCall.name}`,
  )
  const args = parseArguments(first.functionCall.arguments)
  assert(args.marker === marker, 'function_call arguments did not preserve marker')
  trace.function_call_received = true
  trace.function_call_name = first.functionCall.name
  trace.function_call_argument_keys = Object.keys(args).sort()

  const localToolOutput = JSON.stringify({
    ok: true,
    marker,
    executed_by: 'chimera-live-smoke',
  })
  trace.function_call_output_sent = true

  const second = await collectTurn(
    {
      model,
      instructions:
        'You are Chimera live tool probe. After tool output, reply with the marker only.',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Call codex_live_echo once with marker "${marker}" and then reply with the marker only.`,
            },
          ],
        },
        {
          type: 'function_call',
          call_id: first.functionCall.callId,
          name: first.functionCall.name,
          arguments: first.functionCall.arguments,
        },
        {
          type: 'function_call_output',
          call_id: first.functionCall.callId,
          output: localToolOutput,
        },
      ],
      tools: [
        {
          type: 'function',
          name: 'codex_live_echo',
          description: 'Returns the provided marker after local execution.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              marker: { type: 'string' },
            },
            required: ['marker'],
          },
          strict: true,
        },
      ],
      tool_choice: 'none',
      parallel_tool_calls: false,
      store: false,
      stream: true,
      text: { verbosity: 'low' },
    },
    `live-tool-second-${Date.now()}`,
  )

  assert(
    second.text.includes(marker),
    `assistant did not complete with marker after tool result; text was ${JSON.stringify(second.text.slice(0, 200))}`,
  )
  trace.assistant_completed_after_tool = true
  await writeTrace()
  console.log(`live:codex-tool ok (${model})`)
} catch (error) {
  trace.error_type = error?.name ?? 'Error'
  await writeTrace()
  throw error
}

async function collectTurn(request, sessionId) {
  const response = await postCodexResponses(request, { sessionId })
  const seenEvents = new Set()
  const seenItems = new Set()
  const call = { callId: '', name: '', arguments: '' }
  let sawCall = false
  let text = ''

  for await (const event of parseSseStream(response.body)) {
    if (event.event) seenEvents.add(event.event)
    let data
    try {
      data = JSON.parse(event.data)
    } catch {
      continue
    }
    collectJsonTypes(data, seenEvents, seenItems)
    const responseId = getResponseId(data)
    if (responseId) trace.response_id_prefixes.push(responseId.slice(0, 16))

    if (data.type === 'response.output_item.added' && data.item?.type === 'function_call') {
      sawCall = true
      call.callId = data.item.call_id ?? call.callId
      call.name = data.item.name ?? call.name
    } else if (data.type === 'response.function_call_arguments.delta') {
      call.arguments += data.delta ?? ''
    } else if (data.type === 'response.function_call_arguments.done') {
      call.arguments ||= data.arguments ?? ''
    } else if (data.type === 'response.output_item.done' && data.item?.type === 'function_call') {
      sawCall = true
      call.callId = data.item.call_id ?? call.callId
      call.name = data.item.name ?? call.name
      call.arguments ||= data.item.arguments ?? ''
    } else if (data.type === 'response.output_text.delta') {
      text += data.delta ?? ''
    } else if (data.type === 'response.completed') {
      const outputText = collectOutputText(data.response?.output)
      if (outputText) text += outputText
    }
  }

  trace.sse_event_types = mergeSorted(trace.sse_event_types, seenEvents)
  trace.output_item_types = mergeSorted(trace.output_item_types, seenItems)
  trace.response_id_prefixes = [...new Set(trace.response_id_prefixes)]

  return {
    functionCall: sawCall
      ? {
          callId: call.callId,
          name: call.name,
          arguments: call.arguments,
        }
      : null,
    text,
  }
}

function collectJsonTypes(value, seenEvents, seenItems) {
  if (!value || typeof value !== 'object') return
  if (typeof value.type === 'string') seenEvents.add(value.type)
  if (typeof value.item?.type === 'string') seenItems.add(value.item.type)
  if (Array.isArray(value.output)) {
    for (const item of value.output) {
      if (typeof item?.type === 'string') seenItems.add(item.type)
    }
  }
  if (typeof value.output_item?.type === 'string') {
    seenItems.add(value.output_item.type)
  }
  if (value.response && typeof value.response === 'object') {
    collectJsonTypes(value.response, seenEvents, seenItems)
  }
}

function collectOutputText(output) {
  if (!Array.isArray(output)) return ''
  const chunks = []
  for (const item of output) {
    if (!Array.isArray(item?.content)) continue
    for (const part of item.content) {
      if (typeof part?.text === 'string') chunks.push(part.text)
    }
  }
  return chunks.join('')
}

function getResponseId(value) {
  return typeof value?.response?.id === 'string'
    ? value.response.id
    : typeof value?.id === 'string'
      ? value.id
      : null
}

function parseArguments(raw) {
  try {
    return JSON.parse(raw || '{}')
  } catch (error) {
    throw new Error(`invalid function_call arguments JSON: ${error}`)
  }
}

function mergeSorted(existing, nextSet) {
  return [...new Set([...existing, ...nextSet])].sort()
}

async function writeTrace() {
  await writeFile(TRACE_PATH, `${JSON.stringify(trace, null, 2)}\n`, {
    mode: 0o600,
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
