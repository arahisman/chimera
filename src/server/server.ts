export async function startServer(): Promise<{ close: () => Promise<void> }> {
  return { async close() {} }
}

