export type CodexAPIErrorType =
  | 'authentication_error'
  | 'rate_limit_error'
  | 'invalid_request_error'
  | 'api_error'

export class CodexHTTPError extends Error {
  readonly type: CodexAPIErrorType

  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: string,
    public readonly retryAfter?: string,
  ) {
    super(message)
    this.name = 'CodexHTTPError'
    this.type = codexErrorTypeForStatus(status)
  }

  get retryable(): boolean {
    return this.type === 'rate_limit_error' || this.status >= 500
  }

  static async fromResponse(response: Response): Promise<CodexHTTPError> {
    const detail = await safeText(response)
    return new CodexHTTPError(
      response.status,
      codexMessageForStatus(response.status),
      detail,
      response.headers.get('retry-after') ?? undefined,
    )
  }
}

export function codexErrorTypeForStatus(status: number): CodexAPIErrorType {
  if (status === 401 || status === 403) return 'authentication_error'
  if (status === 429) return 'rate_limit_error'
  if (status === 400 || status === 404 || status === 422) {
    return 'invalid_request_error'
  }
  return 'api_error'
}

function codexMessageForStatus(status: number): string {
  if (status === 401) return 'Codex authentication failed'
  if (status === 403) return 'Codex authentication is forbidden'
  if (status === 429) return 'Codex rate limit reached'
  if (status >= 500) return 'Codex upstream error'
  return 'Codex request failed'
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}
