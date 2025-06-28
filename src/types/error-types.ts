export abstract class ClaudeError extends Error {
  abstract readonly isRetryable: boolean
  abstract readonly statusCode?: number
  abstract readonly errorType: 'client' | 'server' | 'network'

  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

export class NetworkError extends ClaudeError {
  readonly isRetryable = true
  readonly errorType = 'network' as const
  readonly statusCode = undefined
}

export class ClientError extends ClaudeError {
  readonly isRetryable = false
  readonly errorType = 'client' as const

  constructor(
    message: string,
    public readonly statusCode: number,
    context?: Record<string, unknown>,
  ) {
    super(message, context)
  }
}

export class ServerError extends ClaudeError {
  readonly isRetryable = true
  readonly errorType = 'server' as const

  constructor(
    message: string,
    public readonly statusCode: number,
    context?: Record<string, unknown>,
  ) {
    super(message, context)
  }
}

export class RateLimitError extends ServerError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    context?: Record<string, unknown>,
  ) {
    super(message, 429, context)
  }
}
