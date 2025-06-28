import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ClaudeClient } from '../../src/client/claude-client.js'
import { ClientError } from '../../src/types/error-types.ts'

vi.mock('fastify-plugin', () => ({
  default: (plugin: any, options: any) => plugin,
}))

describe('Fastify Plugin', () => {
  let mockClient: ClaudeClient
  let mockFastify: any
  let mockRequest: any
  let mockReply: any

  beforeEach(() => {
    mockClient = new ClaudeClient({ apiKey: 'test-key' })
    mockFastify = {
      decorate: vi.fn(),
      addHook: vi.fn(),
      setErrorHandler: vi.fn(),
    }
    mockRequest = {}
    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    }
  })

  async function importPlugin() {
    const plugin = await import('../../src/integrations/fastify/plugin.ts')
    return plugin.default
  }

  describe('plugin registration', () => {
    it('should decorate fastify instance with claude client', async () => {
      const plugin = await importPlugin()
      
      await plugin(mockFastify, { client: mockClient })
      
      expect(mockFastify.decorate).toHaveBeenCalledWith('claude', mockClient)
    })

    it('should add preHandler hook when parseMessages is provided', async () => {
      const plugin = await importPlugin()
      const parseMessages = vi.fn()
      
      await plugin(mockFastify, { 
        client: mockClient, 
        parseMessages 
      })
      
      expect(mockFastify.addHook).toHaveBeenCalledWith(
        'preHandler', 
        expect.any(Function)
      )
    })

    it('should not add preHandler hook when parseMessages is not provided', async () => {
      const plugin = await importPlugin()
      
      await plugin(mockFastify, { client: mockClient })
      
      expect(mockFastify.addHook).not.toHaveBeenCalled()
    })

    it('should set error handler', async () => {
      const plugin = await importPlugin()
      
      await plugin(mockFastify, { client: mockClient })
      
      expect(mockFastify.setErrorHandler).toHaveBeenCalledWith(
        expect.any(Function)
      )
    })
  })

  describe('preHandler hook', () => {
    it('should parse messages successfully', async () => {
      const plugin = await importPlugin()
      const mockMessages = [{ role: 'user', content: 'Hello' }]
      const parseMessages = vi.fn().mockReturnValue(mockMessages)
      
      await plugin(mockFastify, { 
        client: mockClient, 
        parseMessages 
      })
      
      const hookCallback = mockFastify.addHook.mock.calls[0][1]
      await hookCallback(mockRequest, mockReply)
      
      expect(parseMessages).toHaveBeenCalledWith(mockRequest)
      expect(mockRequest.claudeMessages).toEqual(mockMessages)
    })

    it('should handle parse errors', async () => {
      const plugin = await importPlugin()
      const parseMessages = vi.fn().mockImplementation(() => {
        throw new Error('Parse failed')
      })
      
      await plugin(mockFastify, { 
        client: mockClient, 
        parseMessages 
      })
      
      const hookCallback = mockFastify.addHook.mock.calls[0][1]
      await hookCallback(mockRequest, mockReply)
      
      expect(mockReply.status).toHaveBeenCalledWith(400)
      expect(mockReply.send).toHaveBeenCalledWith({ 
        error: 'Invalid message format' 
      })
    })
  })

  describe('error handler', () => {
    it('should handle Claude errors with status code', async () => {
      const plugin = await importPlugin()
      
      await plugin(mockFastify, { client: mockClient })
      
      const errorHandler = mockFastify.setErrorHandler.mock.calls[0][0]
      const claudeError = new ClientError('Bad request', 400)
      claudeError.name = 'ClaudeClientError'
      
      const result = errorHandler(claudeError, mockRequest, mockReply)
      
      expect(mockReply.status).toHaveBeenCalledWith(400)
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          message: 'Bad request',
          type: 'ClientError',
        },
      })
      expect(result).toBeUndefined()
    })

    it('should handle Claude errors without status code', async () => {
      const plugin = await importPlugin()
      
      await plugin(mockFastify, { client: mockClient })
      
      const errorHandler = mockFastify.setErrorHandler.mock.calls[0][0]
      const claudeError = new Error('Some Claude error')
      claudeError.name = 'ClaudeNetworkError'
      
      errorHandler(claudeError, mockRequest, mockReply)
      
      expect(mockReply.status).toHaveBeenCalledWith(500)
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          message: 'Some Claude error',
          type: 'Error',
        },
      })
    })

    it('should throw non-Claude errors', async () => {
      const plugin = await importPlugin()
      
      await plugin(mockFastify, { client: mockClient })
      
      const errorHandler = mockFastify.setErrorHandler.mock.calls[0][0]
      const regularError = new Error('Regular error')
      
      expect(() => errorHandler(regularError, mockRequest, mockReply)).toThrow('Regular error')
      expect(mockReply.status).not.toHaveBeenCalled()
      expect(mockReply.send).not.toHaveBeenCalled()
    })

    it('should handle errors with Claude in the name', async () => {
      const plugin = await importPlugin()
      
      await plugin(mockFastify, { client: mockClient })
      
      const errorHandler = mockFastify.setErrorHandler.mock.calls[0][0]
      const claudeError = new Error('Some error')
      claudeError.name = 'MyClaudeError'
      
      errorHandler(claudeError, mockRequest, mockReply)
      
      expect(mockReply.status).toHaveBeenCalledWith(500)
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          message: 'Some error',
          type: 'Error',
        },
      })
    })
  })
})