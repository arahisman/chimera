import type { LoadedPlugin, PluginError } from '../../types/plugin.js'
import type { MCPServerConnection } from '../../services/mcp/types.js'

export type UnifiedInstalledItem =
  | {
      type: 'plugin'
      id: string
      plugin: LoadedPlugin
      name: string
      marketplace?: string
      isEnabled: boolean
      pendingToggle?: 'will-enable' | 'will-disable'
      errorCount: number
      errors?: PluginError[]
    }
  | {
      type: 'failed-plugin'
      id: string
      name: string
      errors: PluginError[]
    }
  | {
      type: 'flagged-plugin'
      id: string
      name: string
      reason?: string
    }
  | {
      type: 'mcp'
      id: string
      name: string
      client: MCPServerConnection
      parentPluginId?: string
      isEnabled: boolean
    }
