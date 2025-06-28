import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RetryHandler } from '../../src/utils/retry-handler.ts'
import { ClaudeError, NetworkError, RateLimitError, ClientError } from '../../src/types/error-types.ts'

describe('RetryHandler', () => {
  let retryHandler: RetryHandler

  beforeEach(() => {
    retryHandler = new RetryHandler({
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 1000,
      backoffFactor: 2,
      respectRetryAfter: true,
      maxRetryAfterDelay: 5000,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    })
  })

  describe('execute', () => {
    it('should execute operation successfully on first attempt', async () => {
      const mockOperation = vi.fn().mockResolvedValueOnce('success')
      
      const result = await retryHandler.execute(mockOperation)
      
      expect(result).toBe('success')
      expect(mockOperation).toHaveBeenCalledTimes(1)
    })

    it('should retry on retryable errors', async () => {
      const networkError = new NetworkError('Connection failed')
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce('success')
      
      const result = await retryHandler.execute(mockOperation)
      
      expect(result).toBe('success')
      expect(mockOperation).toHaveBeenCalledTimes(3)
    })

    it('should not retry on non-retryable errors', async () => {
      const clientError = new ClientError('Bad request', 400)
      const mockOperation = vi.fn().mockRejectedValueOnce(clientError)
      
      await expect(retryHandler.execute(mockOperation)).rejects.toThrow('Bad request')
      expect(mockOperation).toHaveBeenCalledTimes(1)
    })

    it('should stop retrying after max attempts', async () => {
      const networkError = new NetworkError('Connection failed')
      const mockOperation = vi.fn().mockRejectedValue(networkError)
      
      await expect(retryHandler.execute(mockOperation)).rejects.toThrow('Connection failed')
      expect(mockOperation).toHaveBeenCalledTimes(3)
    })

    it('should retry on fetch TypeError', async () => {
      const fetchError = new TypeError('fetch failed')
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(fetchError)
        .mockResolvedValueOnce('success')
      
      const result = await retryHandler.execute(mockOperation)
      
      expect(result).toBe('success')
      expect(mockOperation).toHaveBeenCalledTimes(2)
    })

    it('should apply exponential backoff with jitter', async () => {
      const networkError = new NetworkError('Connection failed')
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce('success')

      // Mock Math.random to return a predictable value for testing jitter
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const startTime = Date.now()
      await retryHandler.execute(mockOperation)
      const endTime = Date.now()
      
      // Calculate expected delays with mocked Math.random = 0.5
      // First retry: Math.floor(0.5 * 100) = 50ms
      // Second retry: Math.floor(0.5 * 200) = 100ms
      // Total expected delay: 50 + 100 = 150ms (approximately, as Date.now() is not precise)

      // We expect the total time to be around 150ms, but allow for some variance.
      expect(endTime - startTime).toBeGreaterThanOrEqual(140) // Allowing for slight variations
      expect(endTime - startTime).toBeLessThan(200) // Should not be excessively long

      expect(mockOperation).toHaveBeenCalledTimes(3)

      randomSpy.mockRestore() // Restore original Math.random
    })

    it('should respect retry-after header for rate limit errors', async () => {
      const rateLimitError = new RateLimitError('Rate limited', 2)
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce('success')

      const startTime = Date.now()
      await retryHandler.execute(mockOperation)
      const endTime = Date.now()
      
      expect(endTime - startTime).toBeGreaterThan(1800)
      expect(mockOperation).toHaveBeenCalledTimes(2)
    })

    it('should cap retry-after delay at maxRetryAfterDelay', async () => {
      const rateLimitError = new RateLimitError('Rate limited', 10)
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce('success')

      const startTime = Date.now()
      await retryHandler.execute(mockOperation)
      const endTime = Date.now()
      
      expect(endTime - startTime).toBeLessThan(6000)
      expect(endTime - startTime).toBeGreaterThan(4800)
      expect(mockOperation).toHaveBeenCalledTimes(2)
    }, 10000)

    it('should handle rate limit error without retry-after header', async () => {
      const rateLimitError = new RateLimitError('Rate limited')
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce('success')
      
      const result = await retryHandler.execute(mockOperation)
      
      expect(result).toBe('success')
      expect(mockOperation).toHaveBeenCalledTimes(2)
    })

    it('should respect maxDelay for exponential backoff', async () => {
      const shortRetryHandler = new RetryHandler({
        maxAttempts: 10,
        initialDelay: 100,
        maxDelay: 200,
        backoffFactor: 2,
        respectRetryAfter: true,
        maxRetryAfterDelay: 5000,
        retryableStatusCodes: [500],
      })

      const networkError = new NetworkError('Connection failed')
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce('success')

      const startTime = Date.now()
      await shortRetryHandler.execute(mockOperation)
      const endTime = Date.now()
      
      expect(endTime - startTime).toBeLessThan(1000)
      expect(mockOperation).toHaveBeenCalledTimes(4)
    })
  })

  describe('shouldRetry', () => {
    it('should not retry when max attempts reached', () => {
      const networkError = new NetworkError('Connection failed')
      const shouldRetry = retryHandler['shouldRetry'](networkError, 3)
      expect(shouldRetry).toBe(false)
    })

    it('should retry retryable ClaudeErrors', () => {
      const networkError = new NetworkError('Connection failed')
      const shouldRetry = retryHandler['shouldRetry'](networkError, 1)
      expect(shouldRetry).toBe(true)
    })

    it('should not retry non-retryable ClaudeErrors', () => {
      const clientError = new ClientError('Bad request', 400)
      const shouldRetry = retryHandler['shouldRetry'](clientError, 1)
      expect(shouldRetry).toBe(false)
    })

    it('should retry fetch TypeErrors', () => {
      const fetchError = new TypeError('fetch failed')
      const shouldRetry = retryHandler['shouldRetry'](fetchError, 1)
      expect(shouldRetry).toBe(true)
    })

    it('should not retry other errors', () => {
      const otherError = new Error('Some other error')
      const shouldRetry = retryHandler['shouldRetry'](otherError, 1)
      expect(shouldRetry).toBe(false)
    })
  })

  describe('calculateDelay', () => {
    it('should use retry-after for rate limit errors', async () => {
      const rateLimitError = new RateLimitError('Rate limited', 3)
      const delay = await retryHandler['calculateDelay'](rateLimitError, 100, 1)
      expect(delay).toBe(3000)
    })

    it('should cap retry-after delay', async () => {
      const rateLimitError = new RateLimitError('Rate limited', 10)
      const delay = await retryHandler['calculateDelay'](rateLimitError, 100, 1)
      expect(delay).toBe(5000)
    })

    it('should use exponential backoff for other errors', async () => {
      const networkError = new NetworkError('Connection failed')
      const delay = await retryHandler['calculateDelay'](networkError, 100, 2)
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThanOrEqual(200)
    })

    it('should respect maxDelay', async () => {
      const networkError = new NetworkError('Connection failed')
      const delay = await retryHandler['calculateDelay'](networkError, 100, 10)
      expect(delay).toBeLessThanOrEqual(1000)
    })
  })
})