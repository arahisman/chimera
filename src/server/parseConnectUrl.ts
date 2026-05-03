export function parseConnectUrl(url: string): {
  serverUrl: string
  authToken?: string
} {
  const parsed = new URL(url)
  const authToken = parsed.searchParams.get('token') ?? undefined
  parsed.searchParams.delete('token')
  return { serverUrl: parsed.toString(), authToken }
}

