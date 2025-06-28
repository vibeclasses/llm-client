import type { ClaudeMessage } from '@/types/api-types.ts'

export interface ConversationMeta {
  id: string
  title?: string
  createdAt: Date
  updatedAt: Date
  totalTokens: number
  messageCount: number
}

export class ConversationHistoryManager {
  private conversations = new Map<
    string,
    {
      meta: ConversationMeta
      messages: ClaudeMessage[]
    }
  >()

  createConversation(id?: string, title?: string): string {
    const conversationId = id ?? this.generateId()
    const now = new Date()

    this.conversations.set(conversationId, {
      meta: {
        id: conversationId,
        title,
        createdAt: now,
        updatedAt: now,
        totalTokens: 0,
        messageCount: 0,
      },
      messages: [],
    })

    return conversationId
  }

  addMessage(
    conversationId: string,
    message: ClaudeMessage,
    tokenCount?: number,
  ): void {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`)
    }

    conversation.messages.push(message)
    conversation.meta.messageCount++
    conversation.meta.updatedAt = new Date()

    if (tokenCount) {
      conversation.meta.totalTokens += tokenCount
    }
  }

  getConversation(
    conversationId: string,
  ): { meta: ConversationMeta; messages: ClaudeMessage[] } | undefined {
    return this.conversations.get(conversationId)
  }

  getMessages(conversationId: string): ClaudeMessage[] {
    const conversation = this.conversations.get(conversationId)
    return conversation ? [...conversation.messages] : []
  }

  listConversations(): ConversationMeta[] {
    return Array.from(this.conversations.values()).map((conv) => ({
      ...conv.meta,
    }))
  }

  deleteConversation(conversationId: string): boolean {
    return this.conversations.delete(conversationId)
  }

  clearAll(): void {
    this.conversations.clear()
  }

  exportConversation(conversationId: string): string {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`)
    }

    return JSON.stringify(conversation, null, 2)
  }

  importConversation(data: string): string {
    const conversation = JSON.parse(data)
    const id = conversation.meta.id

    // Restore dates
    conversation.meta.createdAt = new Date(conversation.meta.createdAt)
    conversation.meta.updatedAt = new Date(conversation.meta.updatedAt)

    this.conversations.set(id, conversation)
    return id
  }

  private generateId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // Context window management
  trimToFitContext(conversationId: string, maxTokens: number): ClaudeMessage[] {
    const messages = this.getMessages(conversationId)

    // Keep system message if present, trim from oldest user/assistant pairs
    // This is a simplified implementation - in production you might want more sophisticated trimming
    const reversedMessages = [...messages].reverse()
    const trimmedMessages: ClaudeMessage[] = []
    let tokenCount = 0

    for (const message of reversedMessages) {
      // Rough token estimation: ~4 characters per token
      const estimatedTokens = (message.content as string).length / 4

      if (tokenCount + estimatedTokens <= maxTokens) {
        trimmedMessages.unshift(message)
        tokenCount += estimatedTokens
      } else {
        break
      }
    }

    return trimmedMessages
  }
}
