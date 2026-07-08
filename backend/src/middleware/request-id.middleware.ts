import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Attaches a unique request ID to every request for tracing and debugging.
 * The ID is available as `req.requestId` and returned in the response header.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  req.requestId = uuidv4();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

/**
 * Helper to get the request ID from a request object.
 */
export function getRequestId(req: Request): string {
  return req.requestId || 'unknown';
}
