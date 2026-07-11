import { describe, it, expect } from 'vitest';
import {
  validateFile,
  formatFileSize,
  isValidCsvExtension,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_READABLE,
} from '@/lib/validation';

describe('formatFileSize', () => {
  it('should format bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('should format kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('should format megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(1572864)).toBe('1.5 MB');
  });

  it('should format zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });
});

describe('isValidCsvExtension', () => {
  it('should return true for .csv files', () => {
    expect(isValidCsvExtension('data.csv')).toBe(true);
  });

  it('should be case insensitive', () => {
    expect(isValidCsvExtension('DATA.CSV')).toBe(true);
    expect(isValidCsvExtension('Data.Csv')).toBe(true);
  });

  it('should return false for non-.csv files', () => {
    expect(isValidCsvExtension('data.txt')).toBe(false);
    expect(isValidCsvExtension('data.xlsx')).toBe(false);
    expect(isValidCsvExtension('data')).toBe(false);
  });
});

describe('validateFile', () => {
  function createMockFile(name: string, size: number): File {
    const content = 'x'.repeat(Math.max(0, size));
    return new File([content], name, { type: 'text/csv' });
  }

  it('should return valid for a correct CSV file', () => {
    const file = createMockFile('data.csv', 1000);
    const result = validateFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject null file', () => {
    const result = validateFile(null as unknown as File);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('No file provided');
  });

  it('should reject non-CSV extensions', () => {
    const file = createMockFile('data.txt', 1000);
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('TXT');
    expect(result.error).toContain('CSV');
  });

  it('should reject files with no extension', () => {
    const file = createMockFile('datafile', 1000);
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('DATAFILE');
    expect(result.error).toContain('CSV');
  });

  it('should reject files exceeding max size', () => {
    const oversized = createMockFile('data.csv', MAX_FILE_SIZE + 1);
    const result = validateFile(oversized);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(MAX_FILE_SIZE_READABLE);
  });

  it('should reject empty files', () => {
    const empty = createMockFile('data.csv', 0);
    const result = validateFile(empty);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('should accept file exactly at max size', () => {
    const file = createMockFile('data.csv', MAX_FILE_SIZE);
    const result = validateFile(file);
    expect(result.valid).toBe(true);
  });
});
