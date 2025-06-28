import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeClient } from '../../src/client/claude-client.js'
import { NetworkError, ClientError, RateLimitError } from '../../src/types/error-types.ts'

vi.mock('node:fetch')

describe('ClaudeClient', () => {
  let client: ClaudeClient
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = mockFetch
    client = new ClaudeClient({
      apiKey: 'test-api-key',
      model: 'claude-sonnet-4-20250514',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should create instance with default config', () => {
      expect(client).toBeInstanceOf(ClaudeClient)
    })

    it('should merge custom config with defaults', () => {
      const customClient = new ClaudeClient({
        apiKey: 'test-key',
        timeout: 60000,
        maxRetries: 5,
      })
      expect(customClient).toBeInstanceOf(ClaudeClient)
    })

    it('should read MAX_TOKENS from environment variable', () => {
      const originalEnv = process.env.MAX_TOKENS
      process.env.MAX_TOKENS = '8192'
      
      const envClient = new ClaudeClient({
        apiKey: 'test-key',
      })
      
      expect(envClient).toBeInstanceOf(ClaudeClient)
      
      if (originalEnv) {
        process.env.MAX_TOKENS = originalEnv
      } else {
        delete process.env.MAX_TOKENS
      }
    })
  })

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await client.sendMessage([
        { role: 'user', content: 'Hello' },
      ])

      expect(result).toEqual(mockResponse)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            'x-api-key': 'test-api-key',
          }),
        })
      )
    })

    it('should throw error when session token limit is reached', async () => {
      vi.spyOn(client['tokenManager'], 'isSessionLimitReached').mockReturnValue(true)
      vi.spyOn(client['tokenManager'], 'getMaxSessionTokens').mockReturnValue(100000)
      vi.spyOn(client['tokenManager'], 'getTotalSessionTokens').mockReturnValue(100000)

      await expect(
        client.sendMessage([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Session token limit of 100000 has been reached')
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))

      await expect(
        client.sendMessage([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow()
    })

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Bad request' }),
      })

      await expect(
        client.sendMessage([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow()
    })

    it('should handle timeout', async () => {
      const timeoutClient = new ClaudeClient({
        apiKey: 'test-key',
        timeout: 50,
      })

      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      
      mockFetch.mockRejectedValueOnce(abortError)

      await expect(
        timeoutClient.sendMessage([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow()
    })
  })

  describe('sendMessageAsync', () => {
    it('should be alias for sendMessage', async () => {
      const sendMessageSpy = vi.spyOn(client, 'sendMessage')
      const messages = [{ role: 'user' as const, content: 'Hello' }]

      sendMessageSpy.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      })

      await client.sendMessageAsync(messages)
      expect(sendMessageSpy).toHaveBeenCalledWith(messages, {})
    })
  })

  describe('streamMessage', () => {
    it('should throw error when session token limit is reached', async () => {
      vi.spyOn(client['tokenManager'], 'isSessionLimitReached').mockReturnValue(true)
      vi.spyOn(client['tokenManager'], 'getMaxSessionTokens').mockReturnValue(100000)
      vi.spyOn(client['tokenManager'], 'getTotalSessionTokens').mockReturnValue(100000)

      await expect(
        client.streamMessage([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Session token limit of 100000 has been reached')
    })

    it('should delegate to streaming client', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield 'Hello'
          yield ' world'
        }
      }

      vi.spyOn(client['streamingClient'], 'stream').mockResolvedValueOnce(mockStream)

      const result = await client.streamMessage([{ role: 'user', content: 'Hello' }])
      
      expect(client['streamingClient'].stream).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
        }),
        { onContent: undefined }
      )

      const chunks = []
      for await (const chunk of result) {
        chunks.push(chunk)
      }
      expect(chunks).toEqual(['Hello', ' world'])
    })
  })

  describe('countTokens', () => {
    it('should count tokens successfully', async () => {
      const mockResponse = {
        input_tokens: 15,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await client.countTokens({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hello' }],
      })

      expect(result).toEqual(mockResponse)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages/count_tokens',
        expect.objectContaining({
          method: 'POST',
        })
      )
    })
  })

  describe('token management', () => {
    it('should get token usage', () => {
      const usage = client.getTokenUsage()
      expect(usage).toEqual(
        expect.objectContaining({
          totalInputTokens: 0,
          totalOutputTokens: 0,
          requestCount: 0,
        })
      )
    })

    it('should get token usage info', () => {
      const info = client.getTokenUsageInfo()
      expect(info).toEqual(
        expect.objectContaining({
          used: expect.any(Number),
          remaining: expect.any(Number),
          max: expect.any(Number),
          percentage: expect.any(Number),
        })
      )
    })

    it('should reset token usage', () => {
      client.resetTokenUsage()
      const usage = client.getTokenUsage()
      expect(usage.requestCount).toBe(0)
    })
  })

  describe('validateContextWindow', () => {
    it('should validate context window successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 1000 }),
      })

      const result = await client.validateContextWindow([
        { role: 'user', content: 'Hello' },
      ])

      expect(result).toBe(true)
    })

    it('should return false when context window would be exceeded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 199000 }),
      })

      const result = await client.validateContextWindow([
        { role: 'user', content: 'Very long message...' },
      ])

      expect(result).toBe(false)
    })
  })

  describe('event emission', () => {
    it('should emit response event on successful message', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const responseSpy = vi.fn()
      client.on('response', responseSpy)

      await client.sendMessage([{ role: 'user', content: 'Hello' }])

      expect(responseSpy).toHaveBeenCalledWith(mockResponse)
    })

    it('should emit request event when logging is enabled', async () => {
      const loggingClient = new ClaudeClient({
        apiKey: 'test-key',
        enableLogging: true,
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg_123',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      })

      const requestSpy = vi.fn()
      loggingClient.on('request', requestSpy)

      await loggingClient.sendMessage([{ role: 'user', content: 'Hello' }])

      expect(requestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.anthropic.com/v1/messages',
          method: 'POST',
        })
      )
    })
  })
})