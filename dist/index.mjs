// src/client/claude-client.ts
import "dotenv/config";
import { EventEmitter } from "eventemitter3";

// src/types/error-types.ts
var ClaudeError = class extends Error {
  constructor(message, context) {
    super(message);
    this.context = context;
    this.name = this.constructor.name;
  }
};
var NetworkError = class extends ClaudeError {
  constructor() {
    super(...arguments);
    this.isRetryable = true;
    this.errorType = "network";
    this.statusCode = void 0;
  }
};
var ClientError = class extends ClaudeError {
  constructor(message, statusCode, context) {
    super(message, context);
    this.statusCode = statusCode;
    this.isRetryable = false;
    this.errorType = "client";
  }
};
var ServerError = class extends ClaudeError {
  constructor(message, statusCode, context) {
    super(message, context);
    this.statusCode = statusCode;
    this.isRetryable = true;
    this.errorType = "server";
  }
};
var RateLimitError = class extends ServerError {
  constructor(message, retryAfter, context) {
    super(message, 429, context);
    this.retryAfter = retryAfter;
  }
};

// src/utils/retry-handler.ts
var RetryHandler = class {
  constructor(config) {
    this.config = config;
  }
  async execute(operation) {
    let attempt = 0;
    let delay = this.config.initialDelay;
    while (true) {
      try {
        return await operation();
      } catch (error) {
        attempt++;
        if (!this.shouldRetry(error, attempt)) {
          throw error;
        }
        const retryDelay = await this.calculateDelay(error, delay, attempt);
        await this.sleep(retryDelay);
        delay = Math.min(
          delay * this.config.backoffFactor,
          this.config.maxDelay
        );
      }
    }
  }
  shouldRetry(error, attempt) {
    if (attempt >= this.config.maxAttempts) {
      return false;
    }
    if (error instanceof ClaudeError) {
      return error.isRetryable;
    }
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return true;
    }
    return false;
  }
  async calculateDelay(error, baseDelay, attempt) {
    if (error instanceof RateLimitError && error.retryAfter && this.config.respectRetryAfter) {
      const retryAfterMs = error.retryAfter * 1e3;
      return Math.min(retryAfterMs, this.config.maxRetryAfterDelay);
    }
    const exponentialDelay = Math.pow(2, attempt - 1) * baseDelay;
    return Math.floor(
      Math.random() * Math.min(exponentialDelay, this.config.maxDelay)
    );
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/utils/error-classifier.ts
var ErrorClassifier = class {
  /**
   * Classifies an HTTP response into the appropriate error type
   */
  async classifyHttpError(response) {
    const statusCode = response.status;
    try {
      const errorData = await response.json();
      const message = errorData.error?.message ?? `HTTP error ${statusCode}`;
      if (statusCode === 429) {
        const retryAfter = response.headers.get("retry-after");
        return new RateLimitError(
          message,
          retryAfter ? parseInt(retryAfter, 10) : void 0,
          errorData
        );
      }
      if (statusCode >= 400 && statusCode < 500) {
        return new ClientError(message, statusCode, errorData);
      }
      return new ServerError(message, statusCode, errorData);
    } catch (_e) {
      if (statusCode === 429) {
        const retryAfter = response.headers.get("retry-after");
        return new RateLimitError(
          `Rate limit exceeded (${statusCode})`,
          retryAfter ? parseInt(retryAfter, 10) : void 0
        );
      }
      if (statusCode >= 400 && statusCode < 500) {
        return new ClientError(`HTTP error ${statusCode}`, statusCode);
      }
      return new ServerError(`HTTP error ${statusCode}`, statusCode);
    }
  }
  /**
   * Classifies any error into a ClaudeError type
   */
  classifyError(error) {
    if (error instanceof ClaudeError) {
      return error;
    }
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return new NetworkError("Network error occurred during API request", {
        originalError: error.message
      });
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new ServerError("Unexpected error", 500, {
      originalError: errorMessage
    });
  }
};

// src/client/token-manager.ts
var TokenManager = class {
  constructor() {
    this.usage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      requestCount: 0,
      averageInputTokens: 0,
      averageOutputTokens: 0,
      estimatedCost: 0
    };
    this.maxSessionTokens = process.env.MAX_SESSION_TOKENS ? parseInt(process.env.MAX_SESSION_TOKENS, 10) : 1e5;
  }
  trackUsage(responseUsage) {
    this.usage.totalInputTokens += responseUsage.input_tokens ?? 0;
    this.usage.totalOutputTokens += responseUsage.output_tokens ?? 0;
    this.usage.totalCacheCreationTokens += responseUsage.cache_creation_input_tokens ?? 0;
    this.usage.totalCacheReadTokens += responseUsage.cache_read_input_tokens ?? 0;
    this.usage.requestCount++;
    this.calculateAverages();
    this.calculateCost();
  }
  calculateAverages() {
    if (this.usage.requestCount > 0) {
      this.usage.averageInputTokens = this.usage.totalInputTokens / this.usage.requestCount;
      this.usage.averageOutputTokens = this.usage.totalOutputTokens / this.usage.requestCount;
    }
  }
  calculateCost() {
    const inputCostPerMillion = 3;
    const outputCostPerMillion = 15;
    const cacheCreationCostPerMillion = 3.75;
    const cacheReadCostPerMillion = 0.3;
    const inputCost = this.usage.totalInputTokens / 1e6 * inputCostPerMillion;
    const outputCost = this.usage.totalOutputTokens / 1e6 * outputCostPerMillion;
    const cacheCreationCost = this.usage.totalCacheCreationTokens / 1e6 * cacheCreationCostPerMillion;
    const cacheReadCost = this.usage.totalCacheReadTokens / 1e6 * cacheReadCostPerMillion;
    this.usage.estimatedCost = inputCost + outputCost + cacheCreationCost + cacheReadCost;
  }
  getUsage() {
    return { ...this.usage };
  }
  /**
   * Check if the session token limit has been reached
   * @returns true if the session token limit has been reached, false otherwise
   */
  isSessionLimitReached() {
    const totalTokens = this.usage.totalInputTokens + this.usage.totalOutputTokens;
    return totalTokens >= this.maxSessionTokens;
  }
  /**
   * Get the maximum number of tokens allowed in a session
   * @returns The maximum number of tokens allowed in a session
   */
  getMaxSessionTokens() {
    return this.maxSessionTokens;
  }
  /**
   * Get the total number of tokens used in the session
   * @returns The total number of tokens used in the session
   */
  getTotalSessionTokens() {
    return this.usage.totalInputTokens + this.usage.totalOutputTokens;
  }
  /**
   * Get the number of tokens remaining in the session
   * @returns The number of tokens remaining in the session
   */
  getRemainingSessionTokens() {
    return Math.max(0, this.maxSessionTokens - this.getTotalSessionTokens());
  }
  /**
   * Get the percentage of tokens used in the session
   * @returns The percentage of tokens used in the session (0-100)
   */
  getSessionTokenUsagePercentage() {
    return Math.min(
      100,
      this.getTotalSessionTokens() / this.maxSessionTokens * 100
    );
  }
  /**
   * Get detailed information about token usage and limits
   * @returns Object containing token usage information
   */
  getTokenUsageInfo() {
    const used = this.getTotalSessionTokens();
    const remaining = this.getRemainingSessionTokens();
    const max = this.maxSessionTokens;
    const percentage = this.getSessionTokenUsagePercentage();
    return {
      used,
      remaining,
      max,
      percentage
    };
  }
  reset() {
    this.usage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      requestCount: 0,
      averageInputTokens: 0,
      averageOutputTokens: 0,
      estimatedCost: 0
    };
  }
};

// src/client/streaming-client.ts
var StreamingClient = class {
  constructor(config, retryHandler) {
    this.config = config;
    this.retryHandler = retryHandler;
  }
  async *stream(request, options = {}) {
    const response = await this.retryHandler.execute(async () => {
      const response2 = await fetch(`${this.config.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": this.config.apiKey,
          ...this.config.organizationId && {
            "anthropic-organization-id": this.config.organizationId
          }
        },
        body: JSON.stringify(request)
      });
      if (!response2.ok) {
        throw new Error(`HTTP ${response2.status}`);
      }
      return response2;
    });
    if (!response.body) {
      throw new Error("No response body");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let messageId = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "message_start") {
                messageId = parsed.message.id;
                options.onStart?.(messageId);
              } else if (parsed.type === "content_block_delta") {
                const delta = parsed.delta.text ?? "";
                options.onContent?.(delta);
                yield delta;
              } else if (parsed.type === "message_stop") {
                options.onComplete?.(parsed);
              }
            } catch (_error) {
            }
          }
        }
      }
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error(String(error));
      options.onError?.(typedError);
      throw typedError;
    } finally {
      reader.releaseLock();
    }
  }
};

// src/client/claude-client.ts
var ClaudeClient = class extends EventEmitter {
  constructor(config) {
    super();
    const envMaxTokens = process.env.MAX_TOKENS ? parseInt(process.env.MAX_TOKENS, 10) : void 0;
    console.log({ "Using llm-client max tokens": { envMaxTokens } });
    this.config = {
      baseUrl: "https://api.anthropic.com/v1",
      timeout: 3e4,
      maxRetries: 3,
      retryDelay: 1e3,
      maxTokens: envMaxTokens ?? 16384,
      model: "claude-sonnet-4-20250514",
      temperature: 1,
      enableLogging: false,
      organizationId: "",
      ...config
    };
    this.retryHandler = new RetryHandler({
      maxAttempts: this.config.maxRetries,
      initialDelay: this.config.retryDelay,
      maxDelay: 3e4,
      backoffFactor: 2,
      respectRetryAfter: true,
      maxRetryAfterDelay: 6e4,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504, 522, 524]
    });
    this.errorClassifier = new ErrorClassifier();
    this.tokenManager = new TokenManager();
    this.streamingClient = new StreamingClient(this.config, this.retryHandler);
  }
  /**
   * Send a synchronous message to Claude
   * @throws Error if the session token limit would be exceeded
   */
  async sendMessage(messages, options = {}) {
    if (this.tokenManager.isSessionLimitReached()) {
      throw new Error(
        `Session token limit of ${this.tokenManager.getMaxSessionTokens()} has been reached. Current usage: ${this.tokenManager.getTotalSessionTokens()} tokens. Reset token usage with resetTokenUsage() to continue.`
      );
    }
    const request = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages,
      ...options
    };
    return this.retryHandler.execute(async () => {
      const response = await this.makeRequest("/messages", {
        method: "POST",
        body: JSON.stringify(request)
      });
      const data = await response.json();
      this.tokenManager.trackUsage(data.usage);
      this.emit("response", data);
      return data;
    });
  }
  /**
   * Send an asynchronous message to Claude (same as sendMessage but with Promise handling)
   */
  async sendMessageAsync(messages, options = {}) {
    return this.sendMessage(messages, options);
  }
  /**
   * Stream a message response from Claude
   * @throws Error if the session token limit would be exceeded
   */
  async streamMessage(messages, options = {}) {
    if (this.tokenManager.isSessionLimitReached()) {
      throw new Error(
        `Session token limit of ${this.tokenManager.getMaxSessionTokens()} has been reached. Current usage: ${this.tokenManager.getTotalSessionTokens()} tokens. Reset token usage with resetTokenUsage() to continue.`
      );
    }
    const { onContent, ...requestOptions } = options;
    const request = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages,
      stream: true,
      ...requestOptions
    };
    return this.streamingClient.stream(request, { onContent });
  }
  /**
   * Count tokens for a request
   */
  async countTokens(request) {
    return this.retryHandler.execute(async () => {
      const response = await this.makeRequest("/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(request)
      });
      return response.json();
    });
  }
  /**
   * Get token usage statistics
   */
  getTokenUsage() {
    return this.tokenManager.getUsage();
  }
  /**
   * Get detailed information about token usage and limits for UI display
   * @returns Object containing token usage information including remaining tokens
   */
  getTokenUsageInfo() {
    return this.tokenManager.getTokenUsageInfo();
  }
  /**
   * Reset token usage statistics
   */
  resetTokenUsage() {
    this.tokenManager.reset();
  }
  /**
   * Check if context window limit would be exceeded
   */
  async validateContextWindow(messages) {
    const tokenCount = await this.countTokens({
      model: this.config.model,
      messages
    });
    const maxContextTokens = 2e5;
    return tokenCount.input_tokens + this.config.maxTokens <= maxContextTokens;
  }
  async makeRequest(endpoint, options) {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": this.config.apiKey,
      ...this.config.organizationId && {
        "anthropic-organization-id": this.config.organizationId
      },
      ...options.headers
    };
    if (this.config.enableLogging) {
      this.emit("request", { url, method: options.method, headers });
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const error = await this.errorClassifier.classifyHttpError(response);
        throw error;
      }
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
        throw new NetworkError("Request timeout");
      }
      throw this.errorClassifier.classifyError(error);
    }
  }
};

// src/client/openai-client.ts
import "dotenv/config";
import { EventEmitter as EventEmitter2 } from "eventemitter3";
var OpenAIClient = class extends EventEmitter2 {
  constructor(config) {
    super();
    this.config = config;
  }
  async sendMessage(messages, _options = {}) {
    throw new Error("Not implemented");
  }
  async sendMessageAsync(messages, _options = {}) {
    throw new Error("Not implemented");
  }
  async streamMessage(messages, _options = {}) {
    throw new Error("Not implemented");
  }
  async countTokens(_request) {
    throw new Error("Not implemented");
  }
  getTokenUsage() {
    return {};
  }
  getTokenUsageInfo() {
    return {};
  }
  resetTokenUsage() {
  }
};

// src/client/ai-client-factory.ts
function createAIClient(config) {
  const provider = config?.providerOverride ?? process.env.AI_PROVIDER ?? "claude";
  if (provider === "openai") {
    return new OpenAIClient(config);
  }
  return new ClaudeClient(config);
}

// src/conversation/history-manager.ts
var ConversationHistoryManager = class {
  constructor() {
    this.conversations = /* @__PURE__ */ new Map();
  }
  createConversation(id, title) {
    const conversationId = id ?? this.generateId();
    const now = /* @__PURE__ */ new Date();
    this.conversations.set(conversationId, {
      meta: {
        id: conversationId,
        title,
        createdAt: now,
        updatedAt: now,
        totalTokens: 0,
        messageCount: 0
      },
      messages: []
    });
    return conversationId;
  }
  addMessage(conversationId, message, tokenCount) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    conversation.messages.push(message);
    conversation.meta.messageCount++;
    conversation.meta.updatedAt = /* @__PURE__ */ new Date();
    if (tokenCount) {
      conversation.meta.totalTokens += tokenCount;
    }
  }
  getConversation(conversationId) {
    return this.conversations.get(conversationId);
  }
  getMessages(conversationId) {
    const conversation = this.conversations.get(conversationId);
    return conversation ? [...conversation.messages] : [];
  }
  listConversations() {
    return Array.from(this.conversations.values()).map((conv) => ({
      ...conv.meta
    }));
  }
  deleteConversation(conversationId) {
    return this.conversations.delete(conversationId);
  }
  clearAll() {
    this.conversations.clear();
  }
  exportConversation(conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    return JSON.stringify(conversation, null, 2);
  }
  importConversation(data) {
    const conversation = JSON.parse(data);
    const id = conversation.meta.id;
    conversation.meta.createdAt = new Date(conversation.meta.createdAt);
    conversation.meta.updatedAt = new Date(conversation.meta.updatedAt);
    this.conversations.set(id, conversation);
    return id;
  }
  generateId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  // Context window management
  trimToFitContext(conversationId, maxTokens) {
    const messages = this.getMessages(conversationId);
    const reversedMessages = [...messages].reverse();
    const trimmedMessages = [];
    let tokenCount = 0;
    for (const message of reversedMessages) {
      const estimatedTokens = message.content.length / 4;
      if (tokenCount + estimatedTokens <= maxTokens) {
        trimmedMessages.unshift(message);
        tokenCount += estimatedTokens;
      } else {
        break;
      }
    }
    return trimmedMessages;
  }
};
export {
  ClaudeClient,
  ClaudeError,
  ClientError,
  ConversationHistoryManager,
  NetworkError,
  OpenAIClient,
  RateLimitError,
  RetryHandler,
  ServerError,
  StreamingClient,
  TokenManager,
  createAIClient
};
