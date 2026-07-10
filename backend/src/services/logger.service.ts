import pino from 'pino';
import pinoHttp from 'pino-http';
import { Request, Response } from 'express';

// ====================================================================
// Logger Selection — Production vs Development
// ====================================================================
// These are TWO completely separate factory functions. They never share
// code paths, options objects, or configuration. The production branch
// NEVER creates a transport object, never references pino-pretty, and
// never does anything dynamic.
//
// In production: JSON logs only. No transport. No pretty printing.
// In development: Pretty-printed with colors and timestamps.
// ====================================================================

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Production logger factory.
 * Returns a pino instance that outputs structured JSON only.
 * NO transport. NO pino-pretty. NO dynamic configuration.
 * This function must remain completely isolated from any dev-only logic.
 */
function createProductionLogger(): pino.Logger {
  return pino({
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
  });
}

/**
 * Development logger factory.
 * Uses pino-pretty for human-readable output with colors and timestamps.
 * NEVER called in production environments.
 */
function createDevelopmentLogger(): pino.Logger {
  return pino({
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
}

// Create the appropriate logger instance based on environment
// Only ONE of the two factory functions is ever called at runtime.
export const logger: pino.Logger = isProduction
  ? createProductionLogger()
  : createDevelopmentLogger();

/**
 * HTTP request logging middleware for Express.
 * Uses the pre-created logger instance above — never creates its own.
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
