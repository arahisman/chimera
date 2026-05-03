export async function postInterClaudeMessage(
  _target: string,
  _message: string,
): Promise<{ ok: false; error: string }> {
  return {
    ok: false,
    error: 'Remote peer sessions are not available in the local Chimera runtime.',
  }
}

