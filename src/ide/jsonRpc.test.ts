import { describe, expect, test } from 'bun:test'
import { JsonRpcLineDecoder, encodeJsonRpcLine } from './jsonRpc.js'

describe('IDE JSON-RPC line framing', () => {
  test('encodes a single JSON message with newline', () => {
    expect(
      encodeJsonRpcLine({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      }),
    ).toBe('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n')
  })

  test('decodes fragmented newline-delimited messages', () => {
    const decoder = new JsonRpcLineDecoder()
    expect(decoder.push('{"jsonrpc":"2.0","id":')).toEqual([])
    expect(
      decoder.push(
        '1,"result":{}}\n{"jsonrpc":"2.0","method":"event/status","params":{}}\n',
      ),
    ).toEqual([
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', method: 'event/status', params: {} },
    ])
  })

  test('reports invalid JSON with line content', () => {
    const decoder = new JsonRpcLineDecoder()
    expect(() => decoder.push('{broken}\n')).toThrow('Invalid JSON-RPC line')
  })

  test('flushes a final unterminated line when requested', () => {
    const decoder = new JsonRpcLineDecoder()
    decoder.push('{"jsonrpc":"2.0","id":2,"result":{}}')
    expect(decoder.flush()).toEqual([
      { jsonrpc: '2.0', id: 2, result: {} },
    ])
  })
})
