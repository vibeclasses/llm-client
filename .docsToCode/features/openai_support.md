this project is a simple client to act as an integration to anhropic claude api. It handles authentication, token usage, sending messages sync, senting messages async, retries and streaming. I need to implement same stuff for OpenAI  API. I need to provide an agnostic interface and use an environment variable to choose which provide to forward the requests too. It would be nice to have an optional flag on the request to override the setting on the env var. Configurations, api keys should all be load from the host project environment. We must provide samples and instructions on installation and usage. Update our openai.yaml accordingly.

# OpenAI Support

This project now supports both Anthropic Claude and OpenAI APIs via a provider-agnostic interface. You can select the provider using the `AI_PROVIDER` environment variable or override it per request.

## Features
- Provider-agnostic interface (`AIClient`)
- OpenAI and Claude clients with:
  - Authentication
  - Token usage tracking
  - Synchronous and asynchronous messaging
  - Streaming support
  - Automatic retries
- Provider selection via environment variable or request flag
- All configuration and API keys are loaded from environment variables

## Usage

### Installation
```bash
npm install @vibeclasses/llm-client
```

### Environment Variables
Set the following in your environment:

For Claude:
```
AI_PROVIDER=claude
ANTHROPIC_API_KEY=your_claude_api_key
```
For OpenAI:
```
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o
```

### Basic Example
```typescript
import { createAIClient } from '@vibeclasses/llm-client';

const client = createAIClient({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
  model: process.env.ANTHROPIC_MODEL || process.env.OPENAI_MODEL,
  providerOverride: 'openai', // Optional: override env var per request
});

const response = await client.sendMessage([
  { role: 'user', content: 'Hello, AI!' },
]);
console.log(response.content[0].text);
```

### Streaming Example
```typescript
for await (const chunk of client.streamMessage([
  { role: 'user', content: 'Stream a story' },
])) {
  process.stdout.write(chunk);
}
```

## Fastify/Express Integration
You can use the same integration as before, just pass the agnostic client.

## OpenAPI
The OpenAPI spec now documents the provider selection and both Claude and OpenAI request/response schemas.

---
See the README for more details and advanced usage.