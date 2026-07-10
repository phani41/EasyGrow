import pino from 'pino';
import pinoHttp from 'pino-http';
import { Request, Response } from 'express';

// ===== Logger Selection =====
// Use a ternary so that only ONE pino() call is ever evaluated.
// In production, the development branch (with pino-pretty transport) is NEVER executed.
// In development, the production branch (plain JSON) is NEVER executed.

const isProduction = process.env.NODE_ENV === 'production';

export const logger: pino.Logger = isProduction
  ? pino({
      level: process.env.LOG_LEVEL || 'info',
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'body.apiKey', 'body.password'],
        censor: '[REDACTED]',
      },
      serializers: {
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
        err: pino.stdSerializers.err,
      },
    })
  : pino({
      level: process.env.LOG_LEVEL || 'debug',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'body.apiKey', 'body.password'],
        censor: '[REDACTED]',
      },
      serializers: {
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
        err: pino.stdSerializers.err,
      },
    });

/**
 * HTTP request logging middleware for Express.
 * Automatically includes request ID, method, URL, status code, and response time.
 * Skips health check pings in production to reduce noise.
 */
export const httpLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req: Request) => {
      if (isProduction && req.url === '/api/health') {
        return true;
      }
      return false;
    },
  },
  customProps: (req: Request) => ({
    requestId: (req as any).requestId || 'unknown',
  }),
  customSuccessMessage: (req: Request, res: Response, responseTime: number) => {
    return `${req.method} ${req.url} ${res.statusCode} ${responseTime}ms`;
  },
  customErrorMessage: (req: Request, res: Response, err: Error) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },
});

/**
 * Create a child logger with specific context (e.g., per-service).
 */
export function createServiceLogger(service: string): pino.Logger {
  return logger.child({ service });
}

/**
 * Create a child logger for request-specific logging.
 */
export function createRequestLogger(requestId: string): pino.Logger {
  return logger.child({ requestId });
}

export default logger;
