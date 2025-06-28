import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TokenManager } from '@/client/token-manager.js'

describe('TokenManager', () => {
  let tokenManager: TokenManager
  const originalEnv = process.env.MAX_SESSION_TOKENS

  beforeEach(() => {
    delete process.env.MAX_SESSION_TOKENS
    tokenManager = new TokenManager()
  })

  afterEach(() => {
    if (originalEnv) {
      process.env.MAX_SESSION_TOKENS = originalEnv
    } else {
      delete process.env.MAX_SESSION_TOKENS
    }
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const usage = tokenManager.getUsage()
      expect(usage).toEqual({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 0,
        requestCount: 0,
        averageInputTokens: 0,
        averageOutputTokens: 0,
        estimatedCost: 0,
      })
    })

    it('should use environment variable for max session tokens', () => {
      process.env.MAX_SESSION_TOKENS = '50000'
      const envTokenManager = new TokenManager()
      expect(envTokenManager.getMaxSessionTokens()).toBe(50000)
    })

    it('should use default max session tokens when env var is not set', () => {
      expect(tokenManager.getMaxSessionTokens()).toBe(100000)
    })
  })

  describe('trackUsage', () => {
    it('should track basic usage', () => {
      const responseUsage = {
        input_tokens: 100,
        output_tokens: 50,
      }

      tokenManager.trackUsage(responseUsage)
      
      const usage = tokenManager.getUsage()
      expect(usage.totalInputTokens).toBe(100)
      expect(usage.totalOutputTokens).toBe(50)
      expect(usage.requestCount).toBe(1)
      expect(usage.averageInputTokens).toBe(100)
      expect(usage.averageOutputTokens).toBe(50)
    })

    it('should track cache tokens', () => {
      const responseUsage = {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 25,
        cache_read_input_tokens: 10,
      }

      tokenManager.trackUsage(responseUsage)
      
      const usage = tokenManager.getUsage()
      expect(usage.totalCacheCreationTokens).toBe(25)
      expect(usage.totalCacheReadTokens).toBe(10)
    })

    it('should handle missing token fields', () => {
      const responseUsage = {
        input_tokens: 100,
        output_tokens: 0,
      }

      tokenManager.trackUsage(responseUsage)
      
      const usage = tokenManager.getUsage()
      expect(usage.totalInputTokens).toBe(100)
      expect(usage.totalOutputTokens).toBe(0)
      expect(usage.totalCacheCreationTokens).toBe(0)
      expect(usage.totalCacheReadTokens).toBe(0)
    })

    it('should calculate averages correctly over multiple requests', () => {
      tokenManager.trackUsage({ input_tokens: 100, output_tokens: 50 })
      tokenManager.trackUsage({ input_tokens: 200, output_tokens: 100 })
      
      const usage = tokenManager.getUsage()
      expect(usage.averageInputTokens).toBe(150)
      expect(usage.averageOutputTokens).toBe(75)
      expect(usage.requestCount).toBe(2)
    })

    it('should calculate estimated cost correctly', () => {
      tokenManager.trackUsage({
        input_tokens: 1000000,
        output_tokens: 1000000,
        cache_creation_input_tokens: 1000000,
        cache_read_input_tokens: 1000000,
      })
      
      const usage = tokenManager.getUsage()
      const expectedCost = 3.0 + 15.0 + 3.75 + 0.3 // $22.05
      expect(usage.estimatedCost).toBeCloseTo(expectedCost, 2)
    })
  })

  describe('session limits', () => {
    it('should not be at session limit initially', () => {
      expect(tokenManager.isSessionLimitReached()).toBe(false)
    })

    it('should detect when session limit is reached', () => {
      tokenManager.trackUsage({ 
        input_tokens: 60000, 
        output_tokens: 40000 
      })
      
      expect(tokenManager.isSessionLimitReached()).toBe(true)
    })

    it('should calculate total session tokens correctly', () => {
      tokenManager.trackUsage({ input_tokens: 100, output_tokens: 50 })
      expect(tokenManager.getTotalSessionTokens()).toBe(150)
    })

    it('should calculate remaining session tokens correctly', () => {
      tokenManager.trackUsage({ input_tokens: 100, output_tokens: 50 })
      expect(tokenManager.getRemainingSessionTokens()).toBe(99850)
    })

    it('should not return negative remaining tokens', () => {
      tokenManager.trackUsage({ 
        input_tokens: 60000, 
        output_tokens: 50000 
      })
      
      expect(tokenManager.getRemainingSessionTokens()).toBe(0)
    })

    it('should calculate usage percentage correctly', () => {
      tokenManager.trackUsage({ input_tokens: 50000, output_tokens: 0 })
      expect(tokenManager.getSessionTokenUsagePercentage()).toBe(50)
    })

    it('should cap usage percentage at 100', () => {
      tokenManager.trackUsage({ 
        input_tokens: 60000, 
        output_tokens: 50000 
      })
      
      expect(tokenManager.getSessionTokenUsagePercentage()).toBe(100)
    })
  })

  describe('getTokenUsageInfo', () => {
    it('should return comprehensive token usage info', () => {
      tokenManager.trackUsage({ input_tokens: 25000, output_tokens: 15000 })
      
      const info = tokenManager.getTokenUsageInfo()
      expect(info).toEqual({
        used: 40000,
        remaining: 60000,
        max: 100000,
        percentage: 40,
      })
    })
  })

  describe('reset', () => {
    it('should reset all usage statistics', () => {
      tokenManager.trackUsage({ input_tokens: 100, output_tokens: 50 })
      tokenManager.reset()
      
      const usage = tokenManager.getUsage()
      expect(usage).toEqual({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 0,
        requestCount: 0,
        averageInputTokens: 0,
        averageOutputTokens: 0,
        estimatedCost: 0,
      })
    })

    it('should reset session limit status', () => {
      tokenManager.trackUsage({ 
        input_tokens: 60000, 
        output_tokens: 50000 
      })
      
      expect(tokenManager.isSessionLimitReached()).toBe(true)
      
      tokenManager.reset()
      expect(tokenManager.isSessionLimitReached()).toBe(false)
    })
  })

  describe('getUsage', () => {
    it('should return a copy of usage data', () => {
      const usage1 = tokenManager.getUsage()
      const usage2 = tokenManager.getUsage()
      
      expect(usage1).not.toBe(usage2)
      expect(usage1).toEqual(usage2)
    })
  })
})