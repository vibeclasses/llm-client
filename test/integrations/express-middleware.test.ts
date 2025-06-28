import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import { claudeMiddleware, claudeErrorHandler } from '../../src/integrations/express/middleware.ts'
import { ClaudeClient } from '../../src/client/claude-client.js'
import { ClientError } from '../../src/types/error-types.ts'

describe('Express Middleware', () => {
  let mockClient: ClaudeClient
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    mockClient = new ClaudeClient({ apiKey: 'test-key' })
    mockReq = {}
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    mockNext = vi.fn()
  })

  describe('claudeMiddleware', () => {
    it('should attach client to request', () => {
      const middleware = claudeMiddleware({ client: mockClient })
      
      middleware(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockReq.claude).toBe(mockClient)
      expect(mockNext).toHaveBeenCalled()
    })

    it('should parse messages when parseMessages is provided', () => {
      const mockMessages = [{ role: 'user', content: 'Hello' }]
      const parseMessages = vi.fn().mockReturnValue(mockMessages)
      const middleware = claudeMiddleware({ 
        client: mockClient, 
        parseMessages 
      })
      
      middleware(mockReq as Request, mockRes as Response, mockNext)
      
      expect(parseMessages).toHaveBeenCalledWith(mockReq)
      expect(mockReq.claudeMessages).toEqual(mockMessages)
      expect(mockNext).toHaveBeenCalled()
    })

    it('should handle parse errors with custom error handler', () => {
      const parseError = new Error('Parse failed')
      const parseMessages = vi.fn().mockImplementation(() => {
        throw parseError
      })
      const onError = vi.fn()
      const middleware = claudeMiddleware({ 
        client: mockClient, 
        parseMessages,
        onError
      })
      
      middleware(mockReq as Request, mockRes as Response, mockNext)
      
      expect(onError).toHaveBeenCalledWith(parseError, mockReq, mockRes)
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should handle parse errors with default error response', () => {
      const parseMessages = vi.fn().mockImplementation(() => {
        throw new Error('Parse failed')
      })
      const middleware = claudeMiddleware({ 
        client: mockClient, 
        parseMessages
      })
      
      middleware(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({ 
        error: 'Invalid message format' 
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should work without parseMessages option', () => {
      const middleware = claudeMiddleware({ client: mockClient })
      
      middleware(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockReq.claude).toBe(mockClient)
      expect(mockReq.claudeMessages).toBeUndefined()
      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe('claudeErrorHandler', () => {
    it('should handle Claude errors with status code', () => {
      const claudeError = new ClientError('Bad request', 400)
      claudeError.name = 'ClaudeClientError'
      
      claudeErrorHandler(claudeError, mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          message: 'Bad request',
          type: 'ClientError',
        },
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should handle Claude errors without status code', () => {
      const claudeError = new Error('Some Claude error')
      claudeError.name = 'ClaudeNetworkError'
      
      claudeErrorHandler(claudeError, mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          message: 'Some Claude error',
          type: 'Error',
        },
      })
    })

    it('should pass through non-Claude errors', () => {
      const regularError = new Error('Regular error')
      
      claudeErrorHandler(regularError, mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).not.toHaveBeenCalled()
      expect(mockRes.json).not.toHaveBeenCalled()
      expect(mockNext).toHaveBeenCalledWith(regularError)
    })

    it('should handle errors with Claude in the name', () => {
      const claudeError = new Error('Some error')
      claudeError.name = 'MyClaudeError'
      
      claudeErrorHandler(claudeError, mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          message: 'Some error',
          type: 'Error',
        },
      })
    })
  })
})