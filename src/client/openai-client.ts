import 'dotenv/config';
import { EventEmitter } from 'eventemitter3';
import type {
  ClaudeRequest,
  ClaudeResponse,
  TokenCountRequest,
  TokenCountResponse,
} from '@/types/api-types.js';
import type { AIClient } from '@/types/ai-client.js';

export class OpenAIClient extends EventEmitter implements AIClient {
  constructor(private config: Record<string, unknown>) {
    super();
    // TODO: Load config from env (OPENAI_API_KEY, etc.)
  }

  async sendMessage(
    messages: ClaudeRequest['messages'],
    _options: Partial<ClaudeRequest> = {}
  ): Promise<ClaudeResponse> {
    // TODO: Implement OpenAI chat completion call
    throw new Error('Not implemented');
  }

  async sendMessageAsync(
    messages: ClaudeRequest['messages'],
    _options: Partial<ClaudeRequest> = {}
  ): Promise<ClaudeResponse> {
    // TODO: Implement async version
    throw new Error('Not implemented');
  }

  async streamMessage(
    messages: ClaudeRequest['messages'],
    _options: Partial<ClaudeRequest & { onContent?: (delta: string) => void }> = {}
  ): Promise<AsyncIterable<string>> {
    // TODO: Implement streaming for OpenAI
    throw new Error('Not implemented');
  }

  async countTokens(_request: TokenCountRequest): Promise<TokenCountResponse> {
    // TODO: Implement token counting for OpenAI
    throw new Error('Not implemented');
  }

  getTokenUsage(): unknown {
    // TODO: Implement token usage tracking
    return {};
  }

  getTokenUsageInfo(): unknown {
    // TODO: Implement token usage info
    return {};
  }

  resetTokenUsage(): void {
    // TODO: Implement reset
  }
}
