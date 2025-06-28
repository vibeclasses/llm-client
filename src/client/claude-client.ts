import 'dotenv/config'
import { EventEmitter } from 'eventemitter3'
import type {
  ClaudeClientConfig,
  ClaudeRequest,
  ClaudeResponse,
  TokenCountRequest,
  TokenCountResponse,
} from '@/types/index.ts'
import { NetworkError } from '@/types/error-types.ts'
import { RetryHandler } from '@/utils/retry-handler.ts'
import { ErrorClassifier } from '@/utils/error-classifier.ts'
import { TokenManager, type TokenUsage } from './token-manager.ts'
import { StreamingClient } from './streaming-client.ts'

export const supportedModels = [
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  'claude-sonnet-4-20250514',
] as const

export type SupportedClaudeModel = (typeof supportedModels)[number]

export class ClaudeClient extends EventEmitter {
  private readonly config: Required<ClaudeClientConfig>
  private readonly retryHandler: RetryHandler
  private readonly errorClassifier: ErrorClassifier
  private readonly tokenManager: TokenManager
  private readonly streamingClient: StreamingClient
  public readonly supportedModels = supportedModels

  constructor(config: ClaudeClientConfig) {
    super()

    // Get environment variables if available
    const envMaxTokens = process.env.MAX_TOKENS
      ? parseInt(process.env.MAX_TOKENS, 10)
      : undefined
    console.log({ 'Using llm-client max tokens': { envMaxTokens } })

    this.config = {
      baseUrl: 'https://api.anthropic.com/v1',
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      maxTokens: envMaxTokens ?? 16384,
      model: 'claude-sonnet-4-20250514',
      temperature: 1.0,
      enableLogging: false,
      organizationId: '',
      ...config,
    }

    this.retryHandler = new RetryHandler({
      maxAttempts: this.config.maxRetries,
      initialDelay: this.config.retryDelay,
      maxDelay: 30000,
      backoffFactor: 2,
      respectRetryAfter: true,
      maxRetryAfterDelay: 60000,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504, 522, 524],
    })

    this.errorClassifier = new ErrorClassifier()
    this.tokenManager = new TokenManager()
    this.streamingClient = new StreamingClient(this.config, this.retryHandler)
  }

  /**
   * Send a synchronous message to Claude
   * @throws Error if the session token limit would be exceeded
   */
  async sendMessage(
    messages: ClaudeRequest['messages'],
    options: Partial<ClaudeRequest> = {},
  ): Promise<ClaudeResponse> {
    // Check if session token limit has been reached
    if (this.tokenManager.isSessionLimitReached()) {
      throw new Error(
        `Session token limit of ${this.tokenManager.getMaxSessionTokens()} has been reached. ` +
          `Current usage: ${this.tokenManager.getTotalSessionTokens()} tokens. ` +
          `Reset token usage with resetTokenUsage() to continue.`,
      )
    }

    const request: ClaudeRequest = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages,
      ...options,
    }

    return this.retryHandler.execute(async () => {
      const response = await this.makeRequest('/messages', {
        method: 'POST',
        body: JSON.stringify(request),
      })

      const data = await response.json()
      this.tokenManager.trackUsage(data.usage)
      this.emit('response', data)

      return data
    })
  }

  /**
   * Send an asynchronous message to Claude (same as sendMessage but with Promise handling)
   */
  async sendMessageAsync(
    messages: ClaudeRequest['messages'],
    options: Partial<ClaudeRequest> = {},
  ): Promise<ClaudeResponse> {
    return this.sendMessage(messages, options)
  }

  /**
   * Stream a message response from Claude
   * @throws Error if the session token limit would be exceeded
   */
  async streamMessage(
    messages: ClaudeRequest['messages'],
    options: Partial<
      ClaudeRequest & { onContent?: (delta: string) => void }
    > = {},
  ): Promise<AsyncIterable<string>> {
    // Check if session token limit has been reached
    if (this.tokenManager.isSessionLimitReached()) {
      throw new Error(
        `Session token limit of ${this.tokenManager.getMaxSessionTokens()} has been reached. ` +
          `Current usage: ${this.tokenManager.getTotalSessionTokens()} tokens. ` +
          `Reset token usage with resetTokenUsage() to continue.`,
      )
    }

    const { onContent, ...requestOptions } = options

    const request: ClaudeRequest = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages,
      stream: true,
      ...requestOptions,
    }

    return this.streamingClient.stream(request, { onContent })
  }

  /**
   * Count tokens for a request
   */
  async countTokens(request: TokenCountRequest): Promise<TokenCountResponse> {
    return this.retryHandler.execute(async () => {
      const response = await this.makeRequest('/messages/count_tokens', {
        method: 'POST',
        body: JSON.stringify(request),
      })

      return response.json()
    })
  }

  /**
   * Get token usage statistics
   */
  getTokenUsage(): TokenUsage {
    return this.tokenManager.getUsage()
  }

  /**
   * Get detailed information about token usage and limits for UI display
   * @returns Object containing token usage information including remaining tokens
   */
  getTokenUsageInfo(): {
    used: number
    remaining: number
    max: number
    percentage: number
  } {
    return this.tokenManager.getTokenUsageInfo()
  }

  /**
   * Reset token usage statistics
   */
  resetTokenUsage(): void {
    this.tokenManager.reset()
  }

  /**
   * Check if context window limit would be exceeded
   */
  async validateContextWindow(
    messages: ClaudeRequest['messages'],
  ): Promise<boolean> {
    const tokenCount = await this.countTokens({
      model: this.config.model,
      messages,
    })

    // Claude Sonnet 4 has 200,000+ token context window
    const maxContextTokens = 200000
    return tokenCount.input_tokens + this.config.maxTokens <= maxContextTokens
  }

  private async makeRequest(
    endpoint: string,
    options: RequestInit,
  ): Promise<Response> {
    const url = `${this.config.baseUrl}${endpoint}`

    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': this.config.apiKey,
      ...(this.config.organizationId && {
        'anthropic-organization-id': this.config.organizationId,
      }),
      ...(options.headers as Record<string, string>),
    }

    if (this.config.enableLogging) {
      this.emit('request', { url, method: options.method, headers })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const error = await this.errorClassifier.classifyHttpError(response)
        throw error
      }

      return response
    } catch (error: unknown) {
      clearTimeout(timeoutId)

      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'AbortError'
      ) {
        throw new NetworkError('Request timeout')
      }

      throw this.errorClassifier.classifyError(error)
    }
  }
}
