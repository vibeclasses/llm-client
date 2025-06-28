import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ConversationHistoryManager } from '../../src/conversation/history-manager.ts'
import { ClaudeMessage } from '../../src/types/api-types.ts'

describe('ConversationHistoryManager', () => {
  let historyManager: ConversationHistoryManager

  beforeEach(() => {
    historyManager = new ConversationHistoryManager()
  })

  describe('createConversation', () => {
    it('should create conversation with provided id and title', () => {
      const id = historyManager.createConversation('test-id', 'Test Title')
      
      expect(id).toBe('test-id')
      
      const conversation = historyManager.getConversation(id)
      expect(conversation).toBeDefined()
      expect(conversation?.meta.id).toBe('test-id')
      expect(conversation?.meta.title).toBe('Test Title')
      expect(conversation?.meta.messageCount).toBe(0)
      expect(conversation?.meta.totalTokens).toBe(0)
      expect(conversation?.messages).toEqual([])
    })

    it('should generate id when not provided', () => {
      const id = historyManager.createConversation()
      
      expect(id).toMatch(/^conv_\d+_[a-z0-9]+$/)
      
      const conversation = historyManager.getConversation(id)
      expect(conversation).toBeDefined()
      expect(conversation?.meta.id).toBe(id)
    })

    it('should create conversation without title', () => {
      const id = historyManager.createConversation('no-title')
      
      const conversation = historyManager.getConversation(id)
      expect(conversation?.meta.title).toBeUndefined()
    })

    it('should set creation and update timestamps', () => {
      const beforeCreate = new Date()
      const id = historyManager.createConversation()
      const afterCreate = new Date()
      
      const conversation = historyManager.getConversation(id)
      expect(conversation?.meta.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime())
      expect(conversation?.meta.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime())
      expect(conversation?.meta.updatedAt.getTime()).toEqual(conversation?.meta.createdAt.getTime())
    })
  })

  describe('addMessage', () => {
    it('should add message to existing conversation', () => {
      const id = historyManager.createConversation()
      const message: ClaudeMessage = {
        role: 'user',
        content: 'Hello, Claude!'
      }
      
      historyManager.addMessage(id, message, 10)
      
      const conversation = historyManager.getConversation(id)
      expect(conversation?.messages).toHaveLength(1)
      expect(conversation?.messages[0]).toEqual(message)
      expect(conversation?.meta.messageCount).toBe(1)
      expect(conversation?.meta.totalTokens).toBe(10)
    })

    it('should update conversation metadata when adding message', () => {
      const id = historyManager.createConversation()
      const originalUpdatedAt = historyManager.getConversation(id)?.meta.updatedAt
      
      vi.useFakeTimers()
      vi.advanceTimersByTime(1000)
      
      const message: ClaudeMessage = {
        role: 'assistant',
        content: 'Hello!'
      }
      
      historyManager.addMessage(id, message)
      
      const conversation = historyManager.getConversation(id)
      expect(conversation?.meta.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt!.getTime())
      
      vi.useRealTimers()
    })

    it('should throw error for non-existent conversation', () => {
      const message: ClaudeMessage = {
        role: 'user',
        content: 'Hello'
      }
      
      expect(() => {
        historyManager.addMessage('non-existent', message)
      }).toThrow('Conversation non-existent not found')
    })

    it('should handle message without token count', () => {
      const id = historyManager.createConversation()
      const message: ClaudeMessage = {
        role: 'user',
        content: 'Hello'
      }
      
      historyManager.addMessage(id, message)
      
      const conversation = historyManager.getConversation(id)
      expect(conversation?.meta.totalTokens).toBe(0)
      expect(conversation?.meta.messageCount).toBe(1)
    })

    it('should accumulate token counts across messages', () => {
      const id = historyManager.createConversation()
      
      historyManager.addMessage(id, { role: 'user', content: 'First' }, 5)
      historyManager.addMessage(id, { role: 'assistant', content: 'Second' }, 8)
      historyManager.addMessage(id, { role: 'user', content: 'Third' }, 3)
      
      const conversation = historyManager.getConversation(id)
      expect(conversation?.meta.totalTokens).toBe(16)
      expect(conversation?.meta.messageCount).toBe(3)
    })
  })

  describe('getMessages', () => {
    it('should return copy of messages', () => {
      const id = historyManager.createConversation()
      const message: ClaudeMessage = {
        role: 'user',
        content: 'Hello'
      }
      
      historyManager.addMessage(id, message)
      
      const messages1 = historyManager.getMessages(id)
      const messages2 = historyManager.getMessages(id)
      
      expect(messages1).toEqual(messages2)
      expect(messages1).not.toBe(messages2)
    })

    it('should return empty array for non-existent conversation', () => {
      const messages = historyManager.getMessages('non-existent')
      expect(messages).toEqual([])
    })
  })

  describe('listConversations', () => {
    it('should return empty array when no conversations', () => {
      const conversations = historyManager.listConversations()
      expect(conversations).toEqual([])
    })

    it('should list all conversations metadata', () => {
      const id1 = historyManager.createConversation('conv1', 'First')
      const id2 = historyManager.createConversation('conv2', 'Second')
      
      historyManager.addMessage(id1, { role: 'user', content: 'Hello' }, 5)
      
      const conversations = historyManager.listConversations()
      
      expect(conversations).toHaveLength(2)
      expect(conversations.find(c => c.id === id1)).toMatchObject({
        id: id1,
        title: 'First',
        messageCount: 1,
        totalTokens: 5,
      })
      expect(conversations.find(c => c.id === id2)).toMatchObject({
        id: id2,
        title: 'Second',
        messageCount: 0,
        totalTokens: 0,
      })
    })
  })

  describe('deleteConversation', () => {
    it('should delete existing conversation', () => {
      const id = historyManager.createConversation()
      
      expect(historyManager.getConversation(id)).toBeDefined()
      
      const deleted = historyManager.deleteConversation(id)
      
      expect(deleted).toBe(true)
      expect(historyManager.getConversation(id)).toBeUndefined()
    })

    it('should return false for non-existent conversation', () => {
      const deleted = historyManager.deleteConversation('non-existent')
      expect(deleted).toBe(false)
    })
  })

  describe('clearAll', () => {
    it('should clear all conversations', () => {
      historyManager.createConversation('conv1')
      historyManager.createConversation('conv2')
      
      expect(historyManager.listConversations()).toHaveLength(2)
      
      historyManager.clearAll()
      
      expect(historyManager.listConversations()).toHaveLength(0)
    })
  })

  describe('exportConversation', () => {
    it('should export conversation as JSON', () => {
      const id = historyManager.createConversation('test', 'Test Conversation')
      historyManager.addMessage(id, { role: 'user', content: 'Hello' }, 5)
      
      const exported = historyManager.exportConversation(id)
      const parsed = JSON.parse(exported)
      
      expect(parsed.meta.id).toBe(id)
      expect(parsed.meta.title).toBe('Test Conversation')
      expect(parsed.messages).toHaveLength(1)
      expect(parsed.messages[0].content).toBe('Hello')
    })

    it('should throw error for non-existent conversation', () => {
      expect(() => {
        historyManager.exportConversation('non-existent')
      }).toThrow('Conversation non-existent not found')
    })
  })

  describe('importConversation', () => {
    it('should import conversation from JSON', () => {
      const originalId = historyManager.createConversation('original', 'Original')
      historyManager.addMessage(originalId, { role: 'user', content: 'Test' }, 3)
      
      const exported = historyManager.exportConversation(originalId)
      historyManager.deleteConversation(originalId)
      
      const importedId = historyManager.importConversation(exported)
      
      expect(importedId).toBe(originalId)
      
      const conversation = historyManager.getConversation(importedId)
      expect(conversation?.meta.title).toBe('Original')
      expect(conversation?.messages).toHaveLength(1)
      expect(conversation?.messages[0].content).toBe('Test')
      expect(conversation?.meta.totalTokens).toBe(3)
    })

    it('should restore date objects from strings', () => {
      const id = historyManager.createConversation('test')
      const exported = historyManager.exportConversation(id)
      historyManager.deleteConversation(id)
      
      const importedId = historyManager.importConversation(exported)
      const conversation = historyManager.getConversation(importedId)
      
      expect(conversation?.meta.createdAt).toBeInstanceOf(Date)
      expect(conversation?.meta.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('trimToFitContext', () => {
    it('should return all messages when under token limit', () => {
      const id = historyManager.createConversation()
      
      historyManager.addMessage(id, { role: 'user', content: 'Hello' })
      historyManager.addMessage(id, { role: 'assistant', content: 'Hi' })
      
      const trimmed = historyManager.trimToFitContext(id, 1000)
      
      expect(trimmed).toHaveLength(2)
      expect(trimmed[0].content).toBe('Hello')
      expect(trimmed[1].content).toBe('Hi')
    })

    it('should trim oldest messages when over token limit', () => {
      const id = historyManager.createConversation()
      
      // Each message is roughly 20 characters = 5 tokens
      historyManager.addMessage(id, { role: 'user', content: 'First message here.' })      // ~5 tokens
      historyManager.addMessage(id, { role: 'assistant', content: 'Second response msg' })  // ~5 tokens
      historyManager.addMessage(id, { role: 'user', content: 'Third message here.' })       // ~5 tokens
      historyManager.addMessage(id, { role: 'assistant', content: 'Fourth response msg' })  // ~5 tokens
      
      const trimmed = historyManager.trimToFitContext(id, 12) // Should fit ~3 messages
      
      expect(trimmed.length).toBeLessThan(4)
      expect(trimmed[trimmed.length - 1].content).toBe('Fourth response msg')
    })

    it('should return empty array for non-existent conversation', () => {
      const trimmed = historyManager.trimToFitContext('non-existent', 1000)
      expect(trimmed).toEqual([])
    })

    it('should handle very small token limits', () => {
      const id = historyManager.createConversation()
      
      historyManager.addMessage(id, { role: 'user', content: 'A very long message that should not fit in a tiny context window' })
      
      const trimmed = historyManager.trimToFitContext(id, 1)
      
      expect(trimmed).toEqual([])
    })
  })
})