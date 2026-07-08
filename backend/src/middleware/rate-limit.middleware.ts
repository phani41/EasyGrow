import rateLimit from 'express-rate-limit';

/**
 * Global rate limiter — applies to all API routes.
 * Default: 100 requests per 15 minutes per IP.
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.GLOBAL_RATE_LIMIT || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
  },
});

/**
 * Strict rate limiter — applies to upload endpoint.
 * Default: 10 uploads per 15 minutes per IP.
 * This prevents abuse of the file upload endpoint.
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.UPLOAD_RATE_LIMIT || '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Upload limit reached. Please try again later.',
  },
});

/**
 * AI mapping rate limiter — applies to the map endpoint.
 * Default: 20 requests per 15 minutes per IP.
 * This prevents abuse of the (costly) AI endpoint.
 */
export const mapRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.MAP_RATE_LIMIT || '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'AI processing limit reached. Please try again later.',
  },
});
