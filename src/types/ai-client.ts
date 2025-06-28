import type { EventEmitter } from 'eventemitter3'
import type {
  ClaudeRequest,
  ClaudeResponse,
  TokenCountRequest,
  TokenCountResponse,
} from './api-types.js'

export interface AIClient extends EventEmitter {
  sendMessage(
    messages: ClaudeRequest['messages'],
    options?: Partial<ClaudeRequest> & { providerOverride?: string },
  ): Promise<ClaudeResponse>
  sendMessageAsync(
    messages: ClaudeRequest['messages'],
    options?: Partial<ClaudeRequest> & { providerOverride?: string },
  ): Promise<ClaudeResponse>
  streamMessage(
    messages: ClaudeRequest['messages'],
    options?: Partial<
      ClaudeRequest & {
        onContent?: (delta: string) => void
        providerOverride?: string
      }
    >,
  ): Promise<AsyncIterable<string>>
  countTokens(request: TokenCountRequest): Promise<TokenCountResponse>
  getTokenUsage(): unknown
  getTokenUsageInfo(): unknown
  resetTokenUsage(): void
}
