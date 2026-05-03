export async function createSSHSession(): Promise<never> {
  throw new Error('SSH session creation is not available in this local build.')
}

