import { OpenAIClient } from '@/client/openai-client.ts'
import { describe, it, expect } from 'vitest'

describe('OpenAIClient', () => {
  it('should be defined', () => {
    expect(OpenAIClient).toBeDefined()
  })
})
