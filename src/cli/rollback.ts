export async function rollback(
  _target?: string,
  _options?: Record<string, unknown>,
): Promise<void> {
  process.stdout.write('Rollback is not part of Chimera local builds.\n')
}
