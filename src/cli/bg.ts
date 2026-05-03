export async function psHandler(): Promise<void> {
  process.stdout.write('No background Chimera sessions are running.\n')
}

export async function logsHandler(): Promise<void> {
  process.stdout.write('No background Chimera logs are available.\n')
}

export async function attachHandler(): Promise<void> {
  process.stdout.write('Background session attach is not available.\n')
}

export async function killHandler(): Promise<void> {
  process.stdout.write('No background Chimera session was killed.\n')
}

export async function handleBgFlag(): Promise<void> {
  process.stdout.write('Background mode is not available in this local build.\n')
}

