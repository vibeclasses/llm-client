import {
  ClaudeError,
  ClientError,
  ServerError,
  NetworkError,
  RateLimitError,
} from '@/types/error-types.ts'

/**
 * Classifies errors that occur during API calls to the Claude API
 */
export class ErrorClassifier {
  /**
   * Classifies an HTTP response into the appropriate error type
   */
  async classifyHttpError(response: Response): Promise<ClaudeError> {
    const statusCode = response.status

    try {
      // Try to parse the response body as JSON
      const errorData = await response.json()
      const message = errorData.error?.message ?? `HTTP error ${statusCode}`

      // Handle rate limiting specifically
      if (statusCode === 429) {
        const retryAfter = response.headers.get('retry-after')
        return new RateLimitError(
          message,
          retryAfter ? parseInt(retryAfter, 10) : undefined,
          errorData,
        )
      }

      // Client errors (4xx)
      if (statusCode >= 400 && statusCode < 500) {
        return new ClientError(message, statusCode, errorData)
      }

      // Server errors (5xx)
      return new ServerError(message, statusCode, errorData)
    } catch (_e) {
      // If we can't parse the response as JSON, create a simpler error
      if (statusCode === 429) {
        const retryAfter = response.headers.get('retry-after')
        return new RateLimitError(
          `Rate limit exceeded (${statusCode})`,
          retryAfter ? parseInt(retryAfter, 10) : undefined,
        )
      }

      if (statusCode >= 400 && statusCode < 500) {
        return new ClientError(`HTTP error ${statusCode}`, statusCode)
      }

      return new ServerError(`HTTP error ${statusCode}`, statusCode)
    }
  }

  /**
   * Classifies any error into a ClaudeError type
   */
  classifyError(error: unknown): ClaudeError {
    // If it's already a ClaudeError, return it as is
    if (error instanceof ClaudeError) {
      return error
    }

    // Handle fetch/network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return new NetworkError('Network error occurred during API request', {
        originalError: error.message,
      })
    }

    // Handle any other errors as server errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new ServerError('Unexpected error', 500, {
      originalError: errorMessage,
    })
  }
}
