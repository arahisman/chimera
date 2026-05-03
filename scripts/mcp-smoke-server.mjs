#!/usr/bin/env bun
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod/v4'

const server = new McpServer({
  name: 'codex-smoke-server',
  version: '0.0.0',
})

server.registerTool(
  'ping',
  {
    description: 'Return a deterministic Chimera smoke marker.',
    inputSchema: {
      message: z.string().optional(),
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  async ({ message }) => ({
    content: [
      {
        type: 'text',
        text: `mcp pong ${message ?? 'default'}`,
      },
    ],
  }),
)

const transport = new StdioServerTransport()
await server.connect(transport)
