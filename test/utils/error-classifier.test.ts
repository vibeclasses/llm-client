import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ErrorClassifier } from '../../src/utils/error-classifier.ts'
import { 
  ClientError, 
  ServerError, 
  NetworkError, 
  RateLimitError,
  ClaudeError 
} from '../../src/types/error-types.ts'

describe('ErrorClassifier', () => {
  let errorClassifier: ErrorClassifier

  beforeEach(() => {
    errorClassifier = new ErrorClassifier()
  })

  describe('classifyHttpError', () => {
    it('should classify 429 as RateLimitError with retry-after', async () => {
      const mockResponse = {
        status: 429,
        headers: {
          get: vi.fn().mockReturnValue('60'),
        },
        json: vi.fn().mockResolvedValue({
          error: { message: 'Rate limit exceeded' },
        }),
      } as unknown as Response

      const error = await errorClassifier.classifyHttpError(mockResponse)

      expect(error).toBeInstanceOf(RateLimitError)
      expect(error.message).toBe('Rate limit exceeded')
      expect((error as RateLimitError).retryAfter).toBe(60)
      expect(error.statusCode).toBe(429)
    })

    it('should classify 429 without retry-after header', async () => {
      const mockResponse = {
        status: 429,
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
        json: vi.fn().mockResolvedValue({
          error: { message: 'Rate limit exceeded' },
        }),
      } as unknown as Response

      const error = await errorClassifier.classifyHttpError(mockResponse)

      expect(error).toBeInstanceOf(RateLimitError)
      expect((error as RateLimitError).retryAfter).toBeUndefined()
    })

    it('should classify 400 as ClientError', async () => {
      const mockResponse = {
        status: 400,
        headers: {
          get: vi.fn(),
        },
        json: vi.fn().mockResolvedValue({
          error: { message: 'Bad request' },
        }),
      } as unknown as Response

      const error = await errorClassifier.classifyHttpError(mockResponse)

      expect(error).toBeInstanceOf(ClientError)
      expect(error.message).toBe('Bad request')
      expect(error.statusCode).toBe(400)
      expect(error.isRetryable).toBe(false)
    })

    it('should classify 401 as ClientError', async () => {
      const mockResponse = {
        status: 401,
        headers: {
          get: vi.fn(),
        },
        json: vi.fn().mockResolvedValue({
          error: { message: 'Unauthorized' },
        }),
      } as unknown as Response

      const error = await errorClassifier.classifyHttpError(mockResponse)

      expect(error).toBeInstanceOf(ClientError)
      expect(error.message).toBe('Unauthorized')
      expect(error.statusCode).toBe(401)
    })

    it('should classify 500 as ServerError', async () => {
      const mockResponse = {
        status: 500,
        headers: {
          get: vi.fn(),
        },
        json: vi.fn().mockResolvedValue({
          error: { message: 'Internal server error' },
        }),
      } as unknown as Response

      const error = await errorClassifier.classifyHttpError(mockResponse)

      expect(error).toBeInstanceOf(ServerError)
      expect(error.message).toBe('Internal server error')
      expect(error.statusCode).toBe(500)
      expect(error.isRetryable).toBe(true)
    })

    it('should classify 503 as ServerError', async () => {
      const mockResponse = {
        status: 503,
        headers: {
          get: vi.fn(),
        },
        json: vi.fn().mockResolvedValue({
          error: { message: 'Service unavailable' },
        }),
      } as unknown as Response

      const error = await errorClassifier.classifyHttpError(mockResponse)

      expect(error).toBeInstanceOf(ServerError)
      expect(error.statusCode).toBe(503)
    })

    it('should handle response without error message', async () => {
      const mockResponse = {
        status: 404,
        headers: {
          get: vi.fn(),
        },
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response

      const error = await errorClassifier.classifyHttpError(mockResponse)

      expect(error).toBeInstanceOf(ClientError)
      expect(error.message).toBe('HTTP error 404')
      expect(error.statusCode).toBe(404)
    })

    it('should handle JSON parsing errors for 429', async () => {
      const mockResponse = {
        status: 429,
        headers: {
          get: vi.fn().mockReturnValue('30'),
        },
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      } as unknown as Response

      const error = await errorClassifier.classifyHttpError(mockResponse)

      expect(error).toBeInstanceOf(RateLimitError)
      expect(error.message).toBe('Rate limit exceeded (429)')
      expect((error as RateLimitError).retryAfter).toBe(30)
    })

    it('should handle JSON parsing errors for client errors', async () => {
      const mockResponse = {
        status: 400,
        headers: {
          get: vi.fn(),
        },
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      } as unknown as Response

      const error = await errorClassifier.classifyHttpError(mockResponse)

      expect(error).toBeInstanceOf(ClientError)
      expect(error.message).toBe('HTTP error 400')
      expect(error.statusCode).toBe(400)
    })

    it('should handle JSON parsing errors for server errors', async () => {
      const mockResponse = {
        status: 500,
        headers: {
          get: vi.fn(),
        },
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      } as unknown as Response

      const error = await errorClassifier.classifyHttpError(mockResponse)

      expect(error).toBeInstanceOf(ServerError)
      expect(error.message).toBe('HTTP error 500')
      expect(error.statusCode).toBe(500)
    })

    it('should include error context when available', async () => {
      const errorData = {
        error: { message: 'Custom error' },
        details: 'Additional context',
      }

      const mockResponse = {
        status: 400,
        headers: {
          get: vi.fn(),
        },
        json: vi.fn().mockResolvedValue(errorData),
      } as unknown as Response

      const error = await errorClassifier.classifyHttpError(mockResponse)

      expect(error.context).toEqual(errorData)
    })
  })

  describe('classifyError', () => {
    it('should return ClaudeError as is', () => {
      const existingError = new ClientError('Existing error', 400)
      const result = errorClassifier.classifyError(existingError)
      
      expect(result).toBe(existingError)
    })

    it('should classify fetch TypeError as NetworkError', () => {
      const fetchError = new TypeError('fetch failed')
      const result = errorClassifier.classifyError(fetchError)
      
      expect(result).toBeInstanceOf(NetworkError)
      expect(result.message).toBe('Network error occurred during API request')
      expect(result.context?.originalError).toBe('fetch failed')
    })

    it('should classify other TypeErrors as ServerError', () => {
      const typeError = new TypeError('some other type error')
      const result = errorClassifier.classifyError(typeError)
      
      expect(result).toBeInstanceOf(ServerError)
      expect(result.message).toBe('Unexpected error')
      expect(result.statusCode).toBe(500)
    })

    it('should classify Error objects as ServerError', () => {
      const genericError = new Error('Something went wrong')
      const result = errorClassifier.classifyError(genericError)
      
      expect(result).toBeInstanceOf(ServerError)
      expect(result.message).toBe('Unexpected error')
      expect(result.context?.originalError).toBe('Something went wrong')
    })

    it('should classify string errors as ServerError', () => {
      const stringError = 'String error message'
      const result = errorClassifier.classifyError(stringError)
      
      expect(result).toBeInstanceOf(ServerError)
      expect(result.message).toBe('Unexpected error')
      expect(result.context?.originalError).toBe('String error message')
    })

    it('should classify unknown errors as ServerError', () => {
      const unknownError = { someProperty: 'value' }
      const result = errorClassifier.classifyError(unknownError)
      
      expect(result).toBeInstanceOf(ServerError)
      expect(result.message).toBe('Unexpected error')
      expect(result.context?.originalError).toBe('[object Object]')
    })

    it('should classify null/undefined as ServerError', () => {
      const nullError = null
      const result = errorClassifier.classifyError(nullError)
      
      expect(result).toBeInstanceOf(ServerError)
      expect(result.message).toBe('Unexpected error')
      expect(result.context?.originalError).toBe('null')
    })
  })
})