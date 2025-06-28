import type { Request, Response, NextFunction } from 'express'
import type { ClaudeClient } from '@/client/claude-client.js'

declare global {
  // Augment Express Request interface
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      claude?: ClaudeClient
      claudeMessages?: unknown[]
    }
  }
}

export interface ExpressClaudeOptions {
  client: ClaudeClient
  parseMessages?: (req: Request) => unknown[]
  onError?: (error: Error, req: Request, res: Response) => void
}

export function claudeMiddleware(options: ExpressClaudeOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    req.claude = options.client

    if (options.parseMessages) {
      try {
        req.claudeMessages = options.parseMessages(req)
      } catch (error) {
        if (options.onError) {
          return options.onError(error as Error, req, res)
        }
        return res.status(400).json({ error: 'Invalid message format' })
      }
    }

    next()
  }
}

export function claudeErrorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (error.name.includes('Claude')) {
    const statusCode =
      (error as unknown as { statusCode?: number }).statusCode ?? 500
    res.status(statusCode).json({
      error: {
        message: error.message,
        type: error.constructor.name,
      },
    })
    return
  }
  next(error)
}
