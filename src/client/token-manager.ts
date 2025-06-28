export interface TokenResponseUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export interface TokenUsage {
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreationTokens: number
  totalCacheReadTokens: number
  requestCount: number
  averageInputTokens: number
  averageOutputTokens: number
  estimatedCost: number
}

export class TokenManager {
  private usage: TokenUsage = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    requestCount: 0,
    averageInputTokens: 0,
    averageOutputTokens: 0,
    estimatedCost: 0,
  }

  private maxSessionTokens: number

  constructor() {
    // Read MAX_SESSION_TOKENS from environment variable if available
    this.maxSessionTokens = process.env.MAX_SESSION_TOKENS
      ? parseInt(process.env.MAX_SESSION_TOKENS, 10)
      : 100000 // Default value
  }

  trackUsage(responseUsage: TokenResponseUsage): void {
    this.usage.totalInputTokens += responseUsage.input_tokens ?? 0
    this.usage.totalOutputTokens += responseUsage.output_tokens ?? 0
    this.usage.totalCacheCreationTokens +=
      responseUsage.cache_creation_input_tokens ?? 0
    this.usage.totalCacheReadTokens +=
      responseUsage.cache_read_input_tokens ?? 0
    this.usage.requestCount++

    this.calculateAverages()
    this.calculateCost()
  }

  private calculateAverages(): void {
    if (this.usage.requestCount > 0) {
      this.usage.averageInputTokens =
        this.usage.totalInputTokens / this.usage.requestCount
      this.usage.averageOutputTokens =
        this.usage.totalOutputTokens / this.usage.requestCount
    }
  }

  private calculateCost(): void {
    // Claude Sonnet 4 pricing (per million tokens)
    const inputCostPerMillion = 3.0
    const outputCostPerMillion = 15.0
    const cacheCreationCostPerMillion = 3.75
    const cacheReadCostPerMillion = 0.3

    const inputCost =
      (this.usage.totalInputTokens / 1_000_000) * inputCostPerMillion
    const outputCost =
      (this.usage.totalOutputTokens / 1_000_000) * outputCostPerMillion
    const cacheCreationCost =
      (this.usage.totalCacheCreationTokens / 1_000_000) *
      cacheCreationCostPerMillion
    const cacheReadCost =
      (this.usage.totalCacheReadTokens / 1_000_000) * cacheReadCostPerMillion

    this.usage.estimatedCost =
      inputCost + outputCost + cacheCreationCost + cacheReadCost
  }

  getUsage(): TokenUsage {
    return { ...this.usage }
  }

  /**
   * Check if the session token limit has been reached
   * @returns true if the session token limit has been reached, false otherwise
   */
  isSessionLimitReached(): boolean {
    const totalTokens =
      this.usage.totalInputTokens + this.usage.totalOutputTokens
    return totalTokens >= this.maxSessionTokens
  }

  /**
   * Get the maximum number of tokens allowed in a session
   * @returns The maximum number of tokens allowed in a session
   */
  getMaxSessionTokens(): number {
    return this.maxSessionTokens
  }

  /**
   * Get the total number of tokens used in the session
   * @returns The total number of tokens used in the session
   */
  getTotalSessionTokens(): number {
    return this.usage.totalInputTokens + this.usage.totalOutputTokens
  }

  /**
   * Get the number of tokens remaining in the session
   * @returns The number of tokens remaining in the session
   */
  getRemainingSessionTokens(): number {
    return Math.max(0, this.maxSessionTokens - this.getTotalSessionTokens())
  }

  /**
   * Get the percentage of tokens used in the session
   * @returns The percentage of tokens used in the session (0-100)
   */
  getSessionTokenUsagePercentage(): number {
    return Math.min(
      100,
      (this.getTotalSessionTokens() / this.maxSessionTokens) * 100,
    )
  }

  /**
   * Get detailed information about token usage and limits
   * @returns Object containing token usage information
   */
  getTokenUsageInfo(): {
    used: number
    remaining: number
    max: number
    percentage: number
  } {
    const used = this.getTotalSessionTokens()
    const remaining = this.getRemainingSessionTokens()
    const max = this.maxSessionTokens
    const percentage = this.getSessionTokenUsagePercentage()

    return {
      used,
      remaining,
      max,
      percentage,
    }
  }

  reset(): void {
    this.usage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      requestCount: 0,
      averageInputTokens: 0,
      averageOutputTokens: 0,
      estimatedCost: 0,
    }
  }
}
