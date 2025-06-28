export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content:
    | string
    | Array<{
        type: 'text' | 'image' | 'document' | 'tool_use' | 'tool_result'
        text?: string
        [key: string]: unknown
      }>
}

export interface ClaudeRequest {
  model: 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514'
  max_tokens: number
  messages: ClaudeMessage[]
  system?: string
  temperature?: number
  top_p?: number
  top_k?: number
  stop_sequences?: string[]
  stream?: boolean
  metadata?: Record<string, unknown>
  tools?: Array<{
    name: string
    description: string
    input_schema: {
      type: 'object'
      properties: Record<string, unknown>
      required: string[]
    }
  }>
  tool_choice?: {
    type: 'auto' | 'any' | 'tool'
    name?: string
  }
  thinking?: {
    type: 'enabled'
    budget_tokens: number
  }
}

export interface ClaudeResponse {
  id: string
  type: 'message'
  role: 'assistant'
  model: string
  content: Array<{
    type: 'text' | 'thinking' | 'tool_use'
    text?: string
    [key: string]: unknown
  }>
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use'
  stop_sequence?: string
  usage: {
    input_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
    output_tokens: number
  }
}

export interface TokenCountRequest {
  model: string
  messages: ClaudeMessage[]
  system?: string
  tools?: Array<unknown>
}

export interface TokenCountResponse {
  input_tokens: number
}
