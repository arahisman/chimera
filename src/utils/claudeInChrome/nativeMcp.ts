import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'

export type Logger = {
  silly: (message: string, ...args: unknown[]) => void
  debug: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
}

export type PermissionMode =
  | 'ask'
  | 'skip_all_permission_checks'
  | 'follow_a_plan'

export type ChimeraForChromeContext = {
  serverName: string
  logger: Logger
  socketPath: string
  getSocketPaths: () => string[]
  clientTypeId: string
  onAuthenticationError: () => void
  onToolCallDisconnected: () => string
  onExtensionPaired: (deviceId: string, name: string) => void
  getPersistedDeviceId: () => string | undefined
  bridgeConfig?: {
    url: string
    getUserId: () => Promise<string | undefined>
    getOAuthToken: () => Promise<string>
    devUserId?: string
  }
  initialPermissionMode?: PermissionMode
  callOpenAIMessages?: (req: {
    model: string
    max_tokens: number
    system: string
    messages: unknown
    stop_sequences?: string[]
    signal?: AbortSignal
  }) => Promise<{
    content: Array<{ type: 'text'; text: string }>
    stop_reason: string | null
    usage?: { input_tokens: number; output_tokens: number }
  }>
  trackEvent: (eventName: string, metadata?: Record<string, unknown>) => void
}

export const BROWSER_TOOLS: Tool[] = [
  'javascript_tool',
  'read_page',
  'find',
  'form_input',
  'computer',
  'navigate',
  'resize_window',
  'gif_creator',
  'upload_image',
  'get_page_text',
  'tabs_context_mcp',
  'tabs_create_mcp',
  'update_plan',
  'read_console_messages',
  'read_network_requests',
  'shortcuts_list',
  'shortcuts_execute',
].map(name => ({
  name,
  description: `Chimera browser control tool: ${name}`,
  inputSchema: { type: 'object', properties: {} },
}))

export function createChimeraForChromeMcpServer(
  context: ChimeraForChromeContext,
): Server {
  const server = new Server(
    { name: context.serverName, version: MACRO.VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: BROWSER_TOOLS,
  }))

  server.setRequestHandler(
    CallToolRequestSchema,
    async ({ params }): Promise<CallToolResult> => ({
      content: [
        {
          type: 'text',
          text: `Browser control tool "${params.name}" needs the Chimera browser bridge, which is not implemented in this build yet.`,
        },
      ],
      isError: true,
    }),
  )

  return server
}
