import pino from 'pino';
import pinoHttp from 'pino-http';
import { Request, Response } from 'express';

const isProduction = process.env.NODE_ENV === 'production';

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

export const logger: pino.Logger = isProduction
  ? createProductionLogger()
  : createDevelopmentLogger();

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

export default logger;
