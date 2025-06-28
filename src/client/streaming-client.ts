import type {
  ClaudeClientConfig,
  ClaudeRequest,
  ClaudeResponse,
  StreamingOptions,
} from '@/types/index.ts'
import type { RetryHandler } from '@/utils/retry-handler.ts'

export class StreamingClient {
  constructor(
    private readonly config: Required<ClaudeClientConfig>,
    private readonly retryHandler: RetryHandler,
  ) {}

  async *stream(
    request: ClaudeRequest,
    options: StreamingOptions = {},
  ): AsyncIterable<string> {
    const response = await this.retryHandler.execute(async () => {
      const response = await fetch(`${this.config.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': this.config.apiKey,
          ...(this.config.organizationId && {
            'anthropic-organization-id': this.config.organizationId,
          }),
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return response
    })

    if (!response.body) {
      throw new Error('No response body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let messageId = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)

            if (data === '[DONE]') {
              return
            }

            try {
              const parsed = JSON.parse(data)

              if (parsed.type === 'message_start') {
                messageId = parsed.message.id
                options.onStart?.(messageId)
              } else if (parsed.type === 'content_block_delta') {
                const delta = parsed.delta.text ?? ''
                options.onContent?.(delta)
                yield delta
              } else if (parsed.type === 'message_stop') {
                options.onComplete?.(parsed as unknown as ClaudeResponse)
              }
            } catch (_error) {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (error) {
      const typedError =
        error instanceof Error ? error : new Error(String(error))
      options.onError?.(typedError)
      throw typedError
    } finally {
      reader.releaseLock()
    }
  }
}
