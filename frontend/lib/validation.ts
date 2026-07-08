export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface BackendValidationWarning {
  field: string;
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

export interface BackendValidation {
  warnings: BackendValidationWarning[];
  warningCount: number;
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_FILE_SIZE_READABLE = '10 MB';

/**
 * Format bytes into a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate a File object before upload.
 * Checks: file exists, .csv extension, file size, empty file.
 */
export function validateFile(file: File): ValidationResult {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Check extension
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || ext !== 'csv') {
    return {
      valid: false,
      error: ext
        ? `".${ext.toUpperCase()}" files are not supported. Please upload a CSV file.`
        : 'File has no extension. Please upload a .csv file.',
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File is ${formatFileSize(file.size)}. Maximum allowed size is ${MAX_FILE_SIZE_READABLE}.`,
    };
  }

  // Check empty file
  if (file.size === 0) {
    return { valid: false, error: 'The file appears to be empty.' };
  }

  return { valid: true };
}

/**
 * Validate the filename extension only (lightweight check for drag-reject display).
 */
export function isValidCsvExtension(filename: string): boolean {
  return filename.toLowerCase().endsWith('.csv');
}

/**
 * Get a human-readable error message for a backend validation warning.
 */
export function formatValidationWarning(warning: BackendValidationWarning): string {
  return warning.message;
}

/**
 * Get a summary string from backend validation warnings.
 */
export function summarizeWarnings(warnings: BackendValidationWarning[]): string | null {
  if (warnings.length === 0) return null;

  const count = warnings.length;
  const firstMessage = warnings[0].message;
  if (count === 1) return firstMessage;
  return `${firstMessage} (and ${count - 1} more warning${count > 2 ? 's' : ''})`;
}
