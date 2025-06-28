import 'dotenv/config'
import OpenAI from 'openai'
import { EventEmitter } from 'eventemitter3'
import type {
  OpenAIClientConfig,
  ClaudeRequest,
  ClaudeResponse,
} from '@/types/index.ts'
import { TokenManager, type TokenUsage } from './token-manager.ts'
import type { AIClient } from '@/types/ai-client.js'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions.js'
import type {
  TokenCountRequest,
  TokenCountResponse,
} from '@/types/api-types.js'

export class OpenAIClient extends EventEmitter implements AIClient {
  private readonly config: Required<OpenAIClientConfig>
  private readonly openai: OpenAI
  private readonly tokenManager: TokenManager

  constructor(config: OpenAIClientConfig) {
    super()

    const envMaxTokens = process.env.MAX_TOKENS
      ? parseInt(process.env.MAX_TOKENS, 10)
      : undefined

    this.config = {
      baseUrl: 'https://api.openai.com/v1',
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      maxTokens: envMaxTokens ?? 16384,
      model: 'gpt-4o',
      temperature: 1.0,
      enableLogging: false,
      organizationId: '',
      ...config,
    }

    this.openai = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      organization: this.config.organizationId,
    })

    this.tokenManager = new TokenManager()
  }

  // Helper to map ClaudeMessage to OpenAI ChatCompletionMessageParam
  private mapClaudeMessagesToOpenAI(
    messages: ClaudeRequest['messages'],
  ): ChatCompletionMessageParam[] {
    // Only map 'user' and 'assistant' roles, ignore others
    return messages
      .map((msg) => {
        if (msg.role === 'user' || msg.role === 'assistant') {
          return {
            role: msg.role,
            content:
              typeof msg.content === 'string'
                ? msg.content
                : Array.isArray(msg.content)
                  ? msg.content.map((c) => c.text).join('\n')
                  : '',
          } as ChatCompletionMessageParam
        }
        return undefined
      })
      .filter(Boolean) as ChatCompletionMessageParam[]
  }

  async sendMessage(
    messages: ClaudeRequest['messages'],
    _options: Partial<ClaudeRequest> = {},
  ): Promise<ClaudeResponse> {
    if (this.tokenManager.isSessionLimitReached()) {
      throw new Error(
        `Session token limit of ${this.tokenManager.getMaxSessionTokens()} has been reached. ` +
          `Current usage: ${this.tokenManager.getTotalSessionTokens()} tokens. ` +
          `Reset token usage with resetTokenUsage() to continue.`,
      )
    }

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: this.mapClaudeMessagesToOpenAI(messages),
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      // Only include OpenAI-compatible options
    })

    // Map OpenAI finish_reason to ClaudeResponse stop_reason
    let stop_reason: ClaudeResponse['stop_reason'] = 'end_turn'
    switch (response.choices[0].finish_reason) {
      case 'length':
        stop_reason = 'max_tokens'
        break
      case 'stop':
        stop_reason = 'end_turn'
        break
      case 'tool_calls':
        stop_reason = 'tool_use'
        break
      case 'content_filter':
        stop_reason = 'stop_sequence'
        break
      default:
        stop_reason = 'end_turn'
    }

    const claudeResponse: ClaudeResponse = {
      id: response.id,
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: response.choices[0].message.content ?? '',
        },
      ],
      model: response.model,
      stop_reason,
      usage: {
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
      },
    }

    this.tokenManager.trackUsage(claudeResponse.usage)
    this.emit('response', claudeResponse)

    return claudeResponse
  }

  async sendMessageAsync(
    messages: ClaudeRequest['messages'],
    options: Partial<ClaudeRequest> = {},
  ): Promise<ClaudeResponse> {
    return this.sendMessage(messages, options)
  }

  async streamMessage(
    messages: ClaudeRequest['messages'],
    options: Partial<
      ClaudeRequest & { onContent?: (delta: string) => void }
    > = {},
  ): Promise<AsyncIterable<string>> {
    if (this.tokenManager.isSessionLimitReached()) {
      throw new Error(
        `Session token limit of ${this.tokenManager.getMaxSessionTokens()} has been reached. ` +
          `Current usage: ${this.tokenManager.getTotalSessionTokens()} tokens. ` +
          `Reset token usage with resetTokenUsage() to continue.`,
      )
    }

    // Only pass OpenAI-compatible fields
    const stream = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: this.mapClaudeMessagesToOpenAI(messages),
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true,
    } as unknown as import('openai/resources/chat/completions/completions.js').ChatCompletionCreateParamsStreaming)

    // OpenAI streaming returns an AsyncIterable if stream: true
    return (async function* () {
      for await (const chunk of stream as AsyncIterable<
        import('openai/resources/chat/completions/completions.js').ChatCompletionChunk
      >) {
        const delta = chunk.choices[0]?.delta?.content ?? ''
        if (options.onContent) {
          options.onContent(delta)
        }
        yield delta
      }
    })()
  }

  async countTokens(_request: TokenCountRequest): Promise<TokenCountResponse> {
    throw new Error('countTokens is not implemented for OpenAIClient')
  }

  getTokenUsage(): TokenUsage {
    return this.tokenManager.getUsage()
  }

  getTokenUsageInfo(): {
    used: number
    remaining: number
    max: number
    percentage: number
  } {
    return this.tokenManager.getTokenUsageInfo()
  }

  resetTokenUsage(): void {
    this.tokenManager.reset()
  }
}
