import { v4 as uuidv4 } from 'uuid';

export const generateFileId = (): string => uuidv4();

export const isAllowedMimeType = (mimeType: string): boolean => {
  const allowedMimeTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'text/plain',
    'application/octet-stream',
  ];
  return allowedMimeTypes.includes(mimeType);
};

export const sanitizeFileName = (fileName: string): string => {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
};

export const isValidEmail = (email: string): boolean => {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps a promise with a timeout.
 * If the promise doesn't settle within the given time, the returned promise rejects
 * with a TimeoutError. The original promise continues executing but its result is discarded.
 *
 * This is useful for APIs (like the Gemini SDK) that don't support AbortSignal.
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(message || `Operation timed out after ${ms}ms`));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Checks whether the given error is a TimeoutError.
 */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof TimeoutError;
}

/**
 * Sanitize a value for safe inclusion in a prompt template.
 * Strips control characters and truncates excessively long values
 * to prevent prompt injection via malicious CSV data.
 */
function sanitizePromptValue(value: unknown): unknown {
  if (typeof value === 'string') {
    let cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    if (cleaned.length > 10_000) {
      cleaned = cleaned.substring(0, 10_000) + '...[truncated]';
    }
    return cleaned;
  }
  return value;
}

/**
 * Deeply sanitize all string values in an object/array for prompt safety.
 */
export function sanitizeForPrompt<T>(data: T): T {
  if (typeof data === 'string') {
    return sanitizePromptValue(data) as T;
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeForPrompt) as T;
  }
  if (data && typeof data === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      cleaned[key] = sanitizeForPrompt(value);
    }
    return cleaned as T;
  }
  return data;
}
