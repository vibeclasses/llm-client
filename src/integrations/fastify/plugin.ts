// @ts-ignore - Ignoring missing type declarations for fastify
import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify'
// @ts-ignore - Ignoring missing type declarations for fastify-plugin
import fp from 'fastify-plugin'
import type { ClaudeClient } from '@/client/claude-client.js'

declare module 'fastify' {
  interface FastifyInstance {
    claude: ClaudeClient
  }

  interface FastifyRequest {
    claudeMessages?: unknown[]
  }
}

export interface FastifyClaudeOptions extends FastifyPluginOptions {
  client: ClaudeClient
  parseMessages?: (request: unknown) => unknown[]
}

const claudePlugin: FastifyPluginAsync<FastifyClaudeOptions> = async (
  fastify,
  options,
) => {
  fastify.decorate('claude', options.client)

  if (options.parseMessages) {
    fastify.addHook('preHandler', async (request, reply) => {
      try {
        request.claudeMessages = options.parseMessages!(request)
      } catch (_error) {
        reply.status(400).send({ error: 'Invalid message format' })
      }
    })
  }

  fastify.setErrorHandler((error, request, reply) => {
    if (error.name.includes('Claude')) {
      const statusCode =
        (error as unknown as { statusCode?: number }).statusCode ?? 500
      return reply.status(statusCode).send({
        error: {
          message: error.message,
          type: error.constructor.name,
        },
      })
    }

    throw error
  })
}

export default fp(claudePlugin, {
  fastify: '4.x || 5.x',
  name: '@vibeclasses/llm-client',
})
