import type { ClaudeResponse } from './api-types.ts'

export interface ClaudeClientConfig {
  apiKey: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  retryDelay?: number
  maxTokens?: number
  model?: 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514'
  temperature?: number
  enableLogging?: boolean
  organizationId?: string
}

export interface RetryConfig {
  maxAttempts: number
  initialDelay: number
  maxDelay: number
  backoffFactor: number
  respectRetryAfter: boolean
  maxRetryAfterDelay: number
  retryableStatusCodes: number[]
}

export interface StreamingOptions {
  onStart?: (messageId: string) => void
  onContent?: (delta: string) => void
  onComplete?: (response: ClaudeResponse) => void
  onError?: (error: Error) => void
}
