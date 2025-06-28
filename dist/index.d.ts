import { EventEmitter } from 'eventemitter3';

declare abstract class ClaudeError extends Error {
    readonly context?: Record<string, unknown> | undefined;
    abstract readonly isRetryable: boolean;
    abstract readonly statusCode?: number;
    abstract readonly errorType: 'client' | 'server' | 'network';
    constructor(message: string, context?: Record<string, unknown> | undefined);
}
declare class NetworkError extends ClaudeError {
    readonly isRetryable = true;
    readonly errorType: "network";
    readonly statusCode: undefined;
}
declare class ClientError extends ClaudeError {
    readonly statusCode: number;
    readonly isRetryable = false;
    readonly errorType: "client";
    constructor(message: string, statusCode: number, context?: Record<string, unknown>);
}
declare class ServerError extends ClaudeError {
    readonly statusCode: number;
    readonly isRetryable = true;
    readonly errorType: "server";
    constructor(message: string, statusCode: number, context?: Record<string, unknown>);
}
declare class RateLimitError extends ServerError {
    readonly retryAfter?: number | undefined;
    constructor(message: string, retryAfter?: number | undefined, context?: Record<string, unknown>);
}

interface ClaudeMessage {
    role: 'user' | 'assistant';
    content: string | Array<{
        type: 'text' | 'image' | 'document' | 'tool_use' | 'tool_result';
        text?: string;
        [key: string]: unknown;
    }>;
}
interface ClaudeRequest {
    model: 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514';
    max_tokens: number;
    messages: ClaudeMessage[];
    system?: string;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    stop_sequences?: string[];
    stream?: boolean;
    metadata?: Record<string, unknown>;
    tools?: Array<{
        name: string;
        description: string;
        input_schema: {
            type: 'object';
            properties: Record<string, unknown>;
            required: string[];
        };
    }>;
    tool_choice?: {
        type: 'auto' | 'any' | 'tool';
        name?: string;
    };
    thinking?: {
        type: 'enabled';
        budget_tokens: number;
    };
}
interface ClaudeResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    model: string;
    content: Array<{
        type: 'text' | 'thinking' | 'tool_use';
        text?: string;
        [key: string]: unknown;
    }>;
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
    stop_sequence?: string;
    usage: {
        input_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        output_tokens: number;
    };
}
interface TokenCountRequest {
    model: string;
    messages: ClaudeMessage[];
    system?: string;
    tools?: Array<unknown>;
}
interface TokenCountResponse {
    input_tokens: number;
}

interface ClaudeClientConfig {
    apiKey: string;
    baseUrl?: string;
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    maxTokens?: number;
    model?: 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514';
    temperature?: number;
    enableLogging?: boolean;
    organizationId?: string;
}
interface RetryConfig {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffFactor: number;
    respectRetryAfter: boolean;
    maxRetryAfterDelay: number;
    retryableStatusCodes: number[];
}
interface StreamingOptions {
    onStart?: (messageId: string) => void;
    onContent?: (delta: string) => void;
    onComplete?: (response: ClaudeResponse) => void;
    onError?: (error: Error) => void;
}

interface TokenResponseUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}
interface TokenUsage {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheCreationTokens: number;
    totalCacheReadTokens: number;
    requestCount: number;
    averageInputTokens: number;
    averageOutputTokens: number;
    estimatedCost: number;
}
declare class TokenManager {
    private usage;
    private maxSessionTokens;
    constructor();
    trackUsage(responseUsage: TokenResponseUsage): void;
    private calculateAverages;
    private calculateCost;
    getUsage(): TokenUsage;
    /**
     * Check if the session token limit has been reached
     * @returns true if the session token limit has been reached, false otherwise
     */
    isSessionLimitReached(): boolean;
    /**
     * Get the maximum number of tokens allowed in a session
     * @returns The maximum number of tokens allowed in a session
     */
    getMaxSessionTokens(): number;
    /**
     * Get the total number of tokens used in the session
     * @returns The total number of tokens used in the session
     */
    getTotalSessionTokens(): number;
    /**
     * Get the number of tokens remaining in the session
     * @returns The number of tokens remaining in the session
     */
    getRemainingSessionTokens(): number;
    /**
     * Get the percentage of tokens used in the session
     * @returns The percentage of tokens used in the session (0-100)
     */
    getSessionTokenUsagePercentage(): number;
    /**
     * Get detailed information about token usage and limits
     * @returns Object containing token usage information
     */
    getTokenUsageInfo(): {
        used: number;
        remaining: number;
        max: number;
        percentage: number;
    };
    reset(): void;
}

declare class ClaudeClient extends EventEmitter {
    private readonly config;
    private readonly retryHandler;
    private readonly errorClassifier;
    private readonly tokenManager;
    private readonly streamingClient;
    constructor(config: ClaudeClientConfig);
    /**
     * Send a synchronous message to Claude
     * @throws Error if the session token limit would be exceeded
     */
    sendMessage(messages: ClaudeRequest['messages'], options?: Partial<ClaudeRequest>): Promise<ClaudeResponse>;
    /**
     * Send an asynchronous message to Claude (same as sendMessage but with Promise handling)
     */
    sendMessageAsync(messages: ClaudeRequest['messages'], options?: Partial<ClaudeRequest>): Promise<ClaudeResponse>;
    /**
     * Stream a message response from Claude
     * @throws Error if the session token limit would be exceeded
     */
    streamMessage(messages: ClaudeRequest['messages'], options?: Partial<ClaudeRequest & {
        onContent?: (delta: string) => void;
    }>): Promise<AsyncIterable<string>>;
    /**
     * Count tokens for a request
     */
    countTokens(request: TokenCountRequest): Promise<TokenCountResponse>;
    /**
     * Get token usage statistics
     */
    getTokenUsage(): TokenUsage;
    /**
     * Get detailed information about token usage and limits for UI display
     * @returns Object containing token usage information including remaining tokens
     */
    getTokenUsageInfo(): {
        used: number;
        remaining: number;
        max: number;
        percentage: number;
    };
    /**
     * Reset token usage statistics
     */
    resetTokenUsage(): void;
    /**
     * Check if context window limit would be exceeded
     */
    validateContextWindow(messages: ClaudeRequest['messages']): Promise<boolean>;
    private makeRequest;
}

declare class RetryHandler {
    private readonly config;
    constructor(config: RetryConfig);
    execute<T>(operation: () => Promise<T>): Promise<T>;
    private shouldRetry;
    private calculateDelay;
    private sleep;
}

declare class StreamingClient {
    private readonly config;
    private readonly retryHandler;
    constructor(config: Required<ClaudeClientConfig>, retryHandler: RetryHandler);
    stream(request: ClaudeRequest, options?: StreamingOptions): AsyncIterable<string>;
}

interface AIClient extends EventEmitter {
    sendMessage(messages: ClaudeRequest['messages'], options?: Partial<ClaudeRequest> & {
        providerOverride?: string;
    }): Promise<ClaudeResponse>;
    sendMessageAsync(messages: ClaudeRequest['messages'], options?: Partial<ClaudeRequest> & {
        providerOverride?: string;
    }): Promise<ClaudeResponse>;
    streamMessage(messages: ClaudeRequest['messages'], options?: Partial<ClaudeRequest & {
        onContent?: (delta: string) => void;
        providerOverride?: string;
    }>): Promise<AsyncIterable<string>>;
    countTokens(request: TokenCountRequest): Promise<TokenCountResponse>;
    getTokenUsage(): unknown;
    getTokenUsageInfo(): unknown;
    resetTokenUsage(): void;
}

declare function createAIClient(config: ClaudeClientConfig & {
    providerOverride?: string;
}): AIClient;

declare class OpenAIClient extends EventEmitter implements AIClient {
    private config;
    constructor(config: Record<string, unknown>);
    sendMessage(messages: ClaudeRequest['messages'], _options?: Partial<ClaudeRequest>): Promise<ClaudeResponse>;
    sendMessageAsync(messages: ClaudeRequest['messages'], _options?: Partial<ClaudeRequest>): Promise<ClaudeResponse>;
    streamMessage(messages: ClaudeRequest['messages'], _options?: Partial<ClaudeRequest & {
        onContent?: (delta: string) => void;
    }>): Promise<AsyncIterable<string>>;
    countTokens(_request: TokenCountRequest): Promise<TokenCountResponse>;
    getTokenUsage(): unknown;
    getTokenUsageInfo(): unknown;
    resetTokenUsage(): void;
}

interface ConversationMeta {
    id: string;
    title?: string;
    createdAt: Date;
    updatedAt: Date;
    totalTokens: number;
    messageCount: number;
}
declare class ConversationHistoryManager {
    private conversations;
    createConversation(id?: string, title?: string): string;
    addMessage(conversationId: string, message: ClaudeMessage, tokenCount?: number): void;
    getConversation(conversationId: string): {
        meta: ConversationMeta;
        messages: ClaudeMessage[];
    } | undefined;
    getMessages(conversationId: string): ClaudeMessage[];
    listConversations(): ConversationMeta[];
    deleteConversation(conversationId: string): boolean;
    clearAll(): void;
    exportConversation(conversationId: string): string;
    importConversation(data: string): string;
    private generateId;
    trimToFitContext(conversationId: string, maxTokens: number): ClaudeMessage[];
}

export { ClaudeClient, type ClaudeClientConfig, ClaudeError, type ClaudeMessage, type ClaudeRequest, type ClaudeResponse, ClientError, ConversationHistoryManager, NetworkError, OpenAIClient, RateLimitError, type RetryConfig, RetryHandler, ServerError, StreamingClient, type StreamingOptions, type TokenCountRequest, type TokenCountResponse, TokenManager, createAIClient };
