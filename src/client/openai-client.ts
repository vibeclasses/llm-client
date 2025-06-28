import 'dotenv/config'
import { EventEmitter } from 'eventemitter3'
import type {
  ClaudeRequest,
  ClaudeResponse,
  TokenCountRequest,
  TokenCountResponse,
} from '@/types/api-types.js'
import type { AIClient } from '@/types/ai-client.js'

export class OpenAIClient extends EventEmitter implements AIClient {
  constructor(private config: Record<string, unknown>) {
    super()
    // TODO: Load config from env (OPENAI_API_KEY, etc.)
  }

  async sendMessage(
    messages: ClaudeRequest['messages'],
    _options: Partial<ClaudeRequest> = {},
  ): Promise<ClaudeResponse> {
    // Minimal mock implementation for testing
    return {
      id: 'mock-id',
      type: 'message',
      role: 'assistant',
      model: 'gpt-4',
      content: [{ type: 'text', text: 'Hello from OpenAIClient!' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    }
  }

  async sendMessageAsync(
    messages: ClaudeRequest['messages'],
    _options: Partial<ClaudeRequest> = {},
  ): Promise<ClaudeResponse> {
    // TODO: Implement async version
    throw new Error('Not implemented')
  }

  async streamMessage(
    messages: ClaudeRequest['messages'],
    _options: Partial<
      ClaudeRequest & { onContent?: (delta: string) => void }
    > = {},
  ): Promise<AsyncIterable<string>> {
    // Minimal mock streaming implementation for testing
    async function* generator(): AsyncGenerator<string> {
      yield 'This is a mock stream from OpenAIClient.'
    }
    return generator()
  }

  async countTokens(_request: TokenCountRequest): Promise<TokenCountResponse> {
    // TODO: Implement token counting for OpenAI
    throw new Error('Not implemented')
  }

  getTokenUsage(): unknown {
    // TODO: Implement token usage tracking
    return {}
  }

  getTokenUsageInfo(): unknown {
    // TODO: Implement token usage info
    return {}
  }

  resetTokenUsage(): void {
    // TODO: Implement reset
  }
}
