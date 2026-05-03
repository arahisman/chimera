import type { SSHSession } from './createSSHSession.js'

export type SSHSessionManager = ReturnType<SSHSession['createManager']>
