// Core exports
export { ClaudeClient } from './client/claude-client.js'
export { StreamingClient } from './client/streaming-client.js'
export { TokenManager } from './client/token-manager.js'
export { createAIClient } from './client/ai-client-factory.js'
export { OpenAIClient } from './client/openai-client.js'

// Type exports
export * from './types/api-types.js'
export * from './types/config-types.js'
export * from './types/error-types.js'

// Utility exports
export { ConversationHistoryManager } from './conversation/history-manager.js'
export { RetryHandler } from './utils/retry-handler.js'

// Note: Framework integrations are available as separate imports
// These are commented out to avoid build errors if dependencies are missing
// import { claudeMiddleware } from './integrations/express/middleware.js';
// import fastifyPlugin from './integrations/fastify/plugin.js';
