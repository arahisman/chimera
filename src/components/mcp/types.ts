import type {
  MCPServerConnection,
  McpHTTPServerConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
  McpWebSocketServerConfig,
} from '../../services/mcp/types.js'

export type StdioServerInfo = {
  name: string
  scope: string
  client: MCPServerConnection
  config: McpStdioServerConfig
}

export type SSEServerInfo = {
  name: string
  scope: string
  client: MCPServerConnection
  config: McpSSEServerConfig
}

export type HTTPServerInfo = {
  name: string
  scope: string
  client: MCPServerConnection
  config: McpHTTPServerConfig
}

export type ChimeraAIServerInfo = {
  name: string
  scope: string
  client: MCPServerConnection
  config: McpHTTPServerConfig
  isAuthenticated?: boolean
}

export type ServerInfo =
  | StdioServerInfo
  | SSEServerInfo
  | HTTPServerInfo
  | ChimeraAIServerInfo
  | {
      name: string
      scope: string
      client: MCPServerConnection
      config: McpWebSocketServerConfig
    }

export type AgentMcpServerInfo = {
  name: string
  sourceAgents: string[]
  transport: 'stdio' | 'sse' | 'http' | 'ws'
  command?: string
  url?: string
  needsAuth: boolean
}

export type MCPViewState =
  | { type: 'list'; defaultTab?: string }
  | { type: 'stdio-server'; server: StdioServerInfo }
  | { type: 'remote-server'; server: SSEServerInfo | HTTPServerInfo | ChimeraAIServerInfo }
  | { type: 'agent-server'; agentServer: AgentMcpServerInfo }
  | { type: 'tool-list'; server: ServerInfo }
  | { type: 'tool-detail'; server: ServerInfo; toolIndex: number }
