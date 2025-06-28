import { ClaudeClient } from './claude-client.js'
import { OpenAIClient } from './openai-client.js'
import type { AIClient } from '@/types/ai-client.js'
import type { ClaudeClientConfig, OpenAIClientConfig } from '@/types/config-types.js'

export function createAIClient(
  config: (ClaudeClientConfig | OpenAIClientConfig) & { providerOverride?: string },
): AIClient {
  const provider =
    config?.providerOverride ?? process.env.AI_PROVIDER ?? 'claude'

  if (provider === 'openai') {
    return new OpenAIClient(config as OpenAIClientConfig)
  }
  return new ClaudeClient(config as ClaudeClientConfig)
}
