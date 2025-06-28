# @vibeclasses/llm-client

A production-ready TypeScript client for Anthropic Claude and OpenAI APIs with comprehensive features.

## Features

- Provider-agnostic interface (`AIClient`)
- TypeScript client for Claude Sonnet 4 and OpenAI GPT models
- Synchronous and asynchronous responses
- Streaming response capability
- Token usage control and context window monitoring
- API key-based authentication
- Automatic retries with exponential backoff and jitter
- Conversation history management
- Express and Fastify framework integrations
- Comprehensive error handling
- OpenAPI 3.0 specification

## Basic usage

```typescript
import { createAIClient } from "@vibeclasses/llm-client";

const client = createAIClient({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
  model: process.env.ANTHROPIC_MODEL || process.env.OPENAI_MODEL,
  // providerOverride: 'openai', // Optional: override env var per request
});

// Synchronous message
const response = await client.sendMessage([
  { role: "user", content: "Hello, AI!" },
]);
console.log(response.content[0].text);

// Streaming message
for await (const chunk of client.streamMessage([
  { role: "user", content: "Tell me a story" },
])) {
  process.stdout.write(chunk);
}
```

## Fastify integration

```typescript
import Fastify from "fastify";
import { createAIClient } from "@vibeclasses/llm-client";
import claudePlugin from "@vibeclasses/llm-client/fastify";

const fastify = Fastify();
const client = createAIClient({ apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY });

await fastify.register(claudePlugin, {
  client,
  parseMessages: (request) => request.body.messages,
});

fastify.post("/chat", async (request, reply) => {
  const response = await fastify.claude.sendMessage(request.claudeMessages);
  return response;
});
```

## Express integration

```typescript
import { createAIClient } from "@vibeclasses/llm-client";

const client = createAIClient({ apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY });

// Use in your Express middleware as before
```

## Environment Variables

```bash
# Claude
AI_PROVIDER=claude
ANTHROPIC_API_KEY=your_claude_api_key

# OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o
```

---
See `.docsToCode/features/openai_support.md` for more details and advanced usage.
