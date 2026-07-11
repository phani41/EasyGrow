import dotenv from 'dotenv';
dotenv.config();

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[FATAL] Unhandled Promise rejection:', reason);
  process.exit(1);
});

console.log('[Startup] NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('[Startup] Node.js:', process.version);
console.log('[Startup] PID:', process.pid);

import fs from 'fs';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import uploadRoutes from './routes/upload.routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestIdMiddleware, getRequestId } from './middleware/request-id.middleware';
import { globalRateLimiter } from './middleware/rate-limit.middleware';
import { csvCache } from './services/cache.service';
import { logger, httpLogger } from './services/logger.service';
import { metricsHandler } from './services/metrics.service';

import './types/express';

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const isProduction = process.env.NODE_ENV === 'production';

app.use(compression());

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: isProduction ? undefined : false,
  })
);

app.use(requestIdMiddleware);
app.use(httpLogger);

app.use(
  cors({
    origin: isProduction
      ? [CORS_ORIGIN]
      : '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: isProduction,
    maxAge: 86400,
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api', globalRateLimiter);

app.get('/metrics', metricsHandler);

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    requestId: getRequestId(_req),
  });
});

app.use('/api', uploadRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal. Starting graceful shutdown...');

  server.close(() => {
    logger.info('HTTP server closed.');
    csvCache.destroy();
    logger.info('Cache cleared.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const server = app.listen(PORT, async () => {
  const isMockMode = process.env.OPENROUTER_MOCK_MODE === 'true';
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'openrouter/auto';

  logger.info({
    port: PORT,
    corsOrigin: CORS_ORIGIN,
    environment: process.env.NODE_ENV || 'development',
    model,
    apiKeyLoaded: !!apiKey,
    mockMode: isMockMode,
    globalRateLimit: process.env.GLOBAL_RATE_LIMIT || '100',
    uploadRateLimit: process.env.UPLOAD_RATE_LIMIT || '10',
    mapRateLimit: process.env.MAP_RATE_LIMIT || '20',
  }, 'EasyGrow backend server started');

  const configErrors: string[] = [];

  if (!isMockMode && !apiKey) {
    configErrors.push('OPENROUTER_API_KEY is missing. Add it to backend/.env');
  }

  if (!isMockMode && apiKey && !apiKey.startsWith('sk-or-v1-')) {
    configErrors.push(
      'OPENROUTER_API_KEY format is invalid. It should start with "sk-or-v1-". ' +
      'Get a key at https://openrouter.ai/keys'
    );
  }

  if (!process.env.OPENROUTER_MODEL) {
    logger.warn('OPENROUTER_MODEL not set — using default: openrouter/auto');
  }

  if (configErrors.length > 0) {
    logger.warn({ configErrors }, 'OpenRouter configuration has errors. AI features will fail.');
  } else if (!isMockMode) {
    logger.info('OpenRouter validation skipped. Connectivity will be checked on the first AI request.');
  } else {
    logger.info('Running in mock mode — no AI API calls will be made');
  }
});

export default app;
