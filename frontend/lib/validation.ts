export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_FILE_SIZE_READABLE = '50 MB';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\]/g, '_')     // Replace path separators
    .replace(/\0/g, '')          // Remove null bytes
    .replace(/[^\x20-\x7E]/g, '') // Remove non-printable characters
    .trim()
    .slice(0, 255);              // Limit length
}

export function validateFile(file: File): ValidationResult {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Sanitize filename for validation messages
  const safeName = sanitizeFileName(file.name);

  // Check extension
  const ext = safeName.split('.').pop()?.toLowerCase();
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

export function isValidCsvExtension(filename: string): boolean {
  return filename.toLowerCase().endsWith('.csv');
}

export function sanitizeCsvCell(value: string): string {
  if (/^[=+\-@\t]/.test(value)) {
    return `"'${value.replace(/"/g, '""')}"`;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

