import pino from 'pino';
import pinoHttp from 'pino-http';
import { Request, Response } from 'express';

// ===== Logger Configuration =====

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

/**
 * Create a configured Pino logger instance.
 * - Production: Plain JSON output to stdout (no transport needed)
 * - Development: Pretty-printed with colorized output via pino-pretty
 *
 * IMPORTANT: pino-pretty transport is ONLY configured in development.
 * In production the transport option is omitted entirely so pino never
 * tries to load pino-pretty (which is a devDependency).
 */
const pinoOptions: pino.LoggerOptions = {
  level: logLevel,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'body.apiKey', 'body.password'],
    censor: '[REDACTED]',
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
};

if (!isProduction) {
  pinoOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
}

export const logger = pino(pinoOptions);

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
