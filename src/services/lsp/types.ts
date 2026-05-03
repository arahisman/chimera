import { z } from 'zod/v4'
import { lazySchema } from '../../utils/lazySchema.js'

export const LspServerConfigSchema = lazySchema(() =>
  z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    workspaceFolder: z.string().optional(),
    extensionToLanguage: z.record(z.string(), z.string()).default({}),
    initializationOptions: z.unknown().optional(),
    startupTimeout: z.number().optional(),
    shutdownTimeout: z.number().optional(),
    restartOnCrash: z.boolean().optional(),
    maxRestarts: z.number().optional(),
  }),
)

export type LspServerConfig = z.infer<ReturnType<typeof LspServerConfigSchema>>

export type ScopedLspServerConfig = LspServerConfig & {
  scope?: string
  pluginSource?: string
}

export type LspServerState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'
