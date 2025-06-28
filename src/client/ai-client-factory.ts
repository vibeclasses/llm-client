import {
  ClaudeClient,
  supportedModels as supportedClaudeModels,
} from './claude-client.js'
import {
  OpenAIClient,
  supportedModels as supportedOpenAIModels,
} from './openai-client.js'
import type { AIClient } from '@/types/ai-client.js'
import type {
  ClaudeClientConfig,
  OpenAIClientConfig,
} from '@/types/config-types.js'

export const supportedProviders = ['claude', 'openai'] as const

export type SupportedProvider = (typeof supportedProviders)[number]

export const supportedModels = {
  claude: supportedClaudeModels,
  openai: supportedOpenAIModels,
}

export function createAIClient(
  config: (ClaudeClientConfig | OpenAIClientConfig) & {
    providerOverride?: SupportedProvider
  },
): AIClient {
  const provider =
    config?.providerOverride ?? process.env.AI_PROVIDER ?? 'claude'

  if (provider === 'openai') {
    return new OpenAIClient(config as OpenAIClientConfig)
  }
  return new ClaudeClient(config as ClaudeClientConfig)
}
