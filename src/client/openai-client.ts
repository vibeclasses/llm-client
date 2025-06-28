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

  async sendMessage(
    messages: ClaudeRequest['messages'],
    options: Partial<ClaudeRequest> = {},
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
      messages: messages.map(msg => ({ role: msg.role, content: msg.content as string })),
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      ...options,
    })

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
      stop_reason: response.choices[0].finish_reason,
      stop_sequence: null,
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

    const stream = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: messages.map(msg => ({ role: msg.role, content: msg.content as string })),
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true,
      ...options,
    })

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    return (
      async function* () {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || ''
          if (options.onContent) {
            options.onContent(delta)
          }
          yield delta
        }
      }
    )()
  }

  async countTokens(): Promise<any> {
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