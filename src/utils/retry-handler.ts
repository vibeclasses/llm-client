import type { RetryConfig } from '@/types/config-types.ts'
import { ClaudeError, RateLimitError } from '@/types/error-types.ts'

export class RetryHandler {
  constructor(private readonly config: RetryConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0
    let delay = this.config.initialDelay

    while (true) {
      try {
        return await operation()
      } catch (error) {
        attempt++

        if (!this.shouldRetry(error, attempt)) {
          throw error
        }

        const retryDelay = await this.calculateDelay(error, delay, attempt)
        await this.sleep(retryDelay)

        delay = Math.min(
          delay * this.config.backoffFactor,
          this.config.maxDelay,
        )
      }
    }
  }

  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= this.config.maxAttempts) {
      return false
    }

    if (error instanceof ClaudeError) {
      return error.isRetryable
    }

    // Network errors are retryable
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return true
    }

    return false
  }

  private async calculateDelay(
    error: unknown,
    baseDelay: number,
    attempt: number,
  ): Promise<number> {
    // Handle rate limit with Retry-After header
    if (
      error instanceof RateLimitError &&
      error.retryAfter &&
      this.config.respectRetryAfter
    ) {
      const retryAfterMs = error.retryAfter * 1000
      return Math.min(retryAfterMs, this.config.maxRetryAfterDelay)
    }

    // Full jitter exponential backoff
    const exponentialBackoff = Math.pow(2, attempt - 1) * this.config.initialDelay;
    const cappedBackoff = Math.min(exponentialBackoff, this.config.maxDelay);
    return Math.floor(Math.random() * cappedBackoff);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
