import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from 'fastify'
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
  parseMessages?: (request: FastifyRequest) => unknown[]
}

const claudePlugin: FastifyPluginAsync<FastifyClaudeOptions> = async (
  fastify: FastifyInstance,
  options: FastifyClaudeOptions,
) => {
  fastify.decorate('claude', options.client)

  if (options.parseMessages) {
    fastify.addHook(
      'preHandler',
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          request.claudeMessages = options.parseMessages!(request)
        } catch (_error) {
          reply.status(400).send({ error: 'Invalid message format' })
        }
      },
    )
  }

  fastify.setErrorHandler(
    (error: Error, request: FastifyRequest, reply: FastifyReply) => {
      if (error.name.includes('Claude')) {
        const statusCode =
          (error as unknown as { statusCode?: number }).statusCode ?? 500
        reply.status(statusCode).send({
          error: {
            message: error.message,
            type: error.constructor.name,
          },
        })
        return
      }

      throw error
    },
  )
}

export default fp(claudePlugin, {
  fastify: '4.x || 5.x',
  name: '@vibeclasses/llm-client',
})
