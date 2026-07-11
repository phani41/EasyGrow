import { Request, Response, NextFunction } from 'express';
import { AppError, ApiResponse } from '../types';
import '../types/express';
import { getRequestId } from './request-id.middleware';

interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

const ERROR_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  413: 'FILE_TOO_LARGE',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMIT_EXCEEDED',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
};

function getErrorCode(statusCode: number): string {
  return ERROR_CODES[statusCode] || 'UNKNOWN_ERROR';
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response<ApiResponse>,
  _next: NextFunction
): void => {
  const requestId = getRequestId(req);

  let statusCode = 500;
  let message = 'Internal server error';
  let code = 'INTERNAL_ERROR';
  let details: Record<string, unknown> | undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = getErrorCode(statusCode);
    details = err.validationResult
      ? { validation: err.validationResult }
      : undefined;
  }

  if (err.message?.includes('File too large')) {
    statusCode = 413;
    message = 'File size exceeds the maximum limit of 10 MB.';
    code = 'FILE_TOO_LARGE';
  }

  if (err.message?.includes('Unexpected field')) {
    statusCode = 400;
    message = 'Unexpected form field. Please use the field name "file" for uploads.';
    code = 'UNEXPECTED_FIELD';
  }

  const logLine = [
    `[${statusCode}]`,
    `${req.method} ${req.originalUrl}`,
    `[${requestId}]`,
    message,
    statusCode >= 500 ? `\n${err.stack}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (statusCode >= 500) {
    console.error(logLine);
  } else {
    console.warn(logLine);
  }

  const errorResponse: ErrorResponse = {
    success: false,
    error: message,
    code,
    requestId,
  };

  if (details) {
    errorResponse.details = details;
  }

  res.status(statusCode).json(errorResponse);
};

export const notFoundHandler = (
  req: Request,
  res: Response<ApiResponse>
): void => {
  const requestId = getRequestId(req);

  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
    code: 'NOT_FOUND',
    requestId,
  });
};
