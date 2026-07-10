import { CsvRow, ValidationError, ValidationResult } from '../types';

const MAX_COLUMNS = 200;
const MAX_ROWS = 200_000;
const MIN_COLUMNS = 1;
const MIN_ROWS = 1;

export class ValidationService {
  /**
   * Validate parsed CSV headers and rows for content-level correctness.
   * This runs AFTER the file-level checks (mime type, size, extension).
   */
  validateCsvContent(
    headers: string[],
    rows: CsvRow[]
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // --- Header Validation ---
    this.validateHeaders(headers, errors);

    // --- Row Count Validation ---
    this.validateRowCount(rows, errors);

    // If no rows, no need for deeper validation
    if (rows.length === 0) {
      return this.buildResult(errors, warnings);
    }

    // --- Column Count Consistency ---
    this.validateColumnConsistency(headers, rows, errors, warnings);

    // --- Data Quality Checks ---
    this.validateDataQuality(rows, headers, warnings);

    return this.buildResult(errors, warnings);
  }

  private validateHeaders(
    headers: string[],
    errors: ValidationError[]
  ): void {
    if (!headers || headers.length === 0) {
      errors.push({
        field: 'headers',
        message: 'CSV file has no headers. The first row must contain column names.',
        code: 'EMPTY_HEADERS',
      });
      return;
    }

    if (headers.length < MIN_COLUMNS) {
      errors.push({
        field: 'headers',
        message: `CSV must have at least ${MIN_COLUMNS} column. Found ${headers.length}.`,
        code: 'INSUFFICIENT_COLUMNS',
      });
    }

    if (headers.length > MAX_COLUMNS) {
      errors.push({
        field: 'headers',
        message: `CSV has ${headers.length} columns, which exceeds the maximum of ${MAX_COLUMNS}.`,
        code: 'TOO_MANY_COLUMNS',
      });
    }

    // Check for empty column names
    const emptyHeaders = headers.filter((h) => !h || h.trim() === '');
    if (emptyHeaders.length > 0) {
      errors.push({
        field: 'headers',
        message: `${emptyHeaders.length} column header(s) are empty. All headers must have a name.`,
        code: 'EMPTY_COLUMN_NAMES',
        details: { emptyCount: emptyHeaders.length },
      });
    }

    // Check for duplicate headers
    const seen = new Map<string, number>();
    const duplicates: string[] = [];
    for (const header of headers) {
      const lower = header.toLowerCase().trim();
      const count = seen.get(lower) || 0;
      if (count >= 1) {
        duplicates.push(header);
      }
      seen.set(lower, count + 1);
    }
    if (duplicates.length > 0) {
      errors.push({
        field: 'headers',
        message: `Duplicate column headers found: ${[...new Set(duplicates)].join(', ')}. Each column must have a unique name.`,
        code: 'DUPLICATE_HEADERS',
        details: { duplicates: [...new Set(duplicates)] },
      });
    }
  }

  private validateRowCount(
    rows: CsvRow[],
    errors: ValidationError[]
  ): void {
    if (!rows || rows.length === 0) {
      errors.push({
        field: 'rows',
        message: 'CSV file contains no data rows after the header.',
        code: 'EMPTY_ROWS',
      });
      return;
    }

    if (rows.length < MIN_ROWS) {
      errors.push({
        field: 'rows',
        message: `CSV must have at least ${MIN_ROWS} data row. Found ${rows.length}.`,
        code: 'INSUFFICIENT_ROWS',
      });
    }

    if (rows.length > MAX_ROWS) {
      errors.push({
        field: 'rows',
        message: `CSV has ${rows.length.toLocaleString()} rows, which exceeds the maximum of ${MAX_ROWS.toLocaleString()}. Please split your file into smaller batches.`,
        code: 'TOO_MANY_ROWS',
        details: { maxRows: MAX_ROWS, foundRows: rows.length },
      });
    }
  }

  private validateColumnConsistency(
    headers: string[],
    rows: CsvRow[],
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    const expectedColumns = headers.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const actualColumns = Object.keys(row).length;

      if (actualColumns < expectedColumns) {
        const missingColumns = expectedColumns - actualColumns;
        warnings.push({
          field: `rows[${i}]`,
          message: `Row ${i + 1} has ${missingColumns} fewer column(s) than the header. Missing values will be treated as empty.`,
          code: 'INCONSISTENT_COLUMNS',
          details: { row: i + 1, expected: expectedColumns, actual: actualColumns },
        });
      } else if (actualColumns > expectedColumns) {
        warnings.push({
          field: `rows[${i}]`,
          message: `Row ${i + 1} has ${actualColumns - expectedColumns} extra column(s) beyond the header. Extra values will be ignored.`,
          code: 'EXTRA_COLUMNS',
          details: { row: i + 1, expected: expectedColumns, actual: actualColumns },
        });
      }
    }
  }

  /**
   * Patterns that indicate a CSV injection (aka formula injection) attempt.
   * When a cell starts with =, +, -, @, or tab, Excel/Sheets may execute it as a formula.
   */
  private readonly CSV_INJECTION_PATTERN = /^[=+\-@\t]/;

  private validateDataQuality(
    rows: CsvRow[],
    headers: string[],
    warnings: ValidationError[]
  ): void {
    // Check for rows that are entirely empty
    let emptyRowCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const allEmpty = headers.every(
        (h) => !row[h.trim()] || row[h.trim()]?.trim() === ''
      );
      if (allEmpty) {
        emptyRowCount++;
      }
    }

    if (emptyRowCount > 0) {
      warnings.push({
        field: 'rows',
        message: `${emptyRowCount} row(s) are completely empty. These will be skipped during processing.`,
        code: 'EMPTY_ROWS_CONTENT',
        details: { emptyRowCount },
      });
    }

    // Check for stray control characters that indicate encoding issues
    const controlCharPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
    let hasControlChars = false;
    for (let i = 0; i < Math.min(rows.length, 100); i++) {
      const row = rows[i];
      for (const value of Object.values(row)) {
        if (value && controlCharPattern.test(value)) {
          hasControlChars = true;
          break;
        }
      }
      if (hasControlChars) break;
    }
    if (hasControlChars) {
      warnings.push({
        field: 'file',
        message: 'The file contains unexpected control characters. CSV should be saved as UTF-8 for best results.',
        code: 'ENCODING_WARNING',
      });
    }

    // Check for CSV injection (formula injection) in cell values
    // Scan all rows to catch injection attempts anywhere in the file
    let injectionCount = 0;
    const injectionFields = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (const [key, value] of Object.entries(row)) {
        if (value && this.CSV_INJECTION_PATTERN.test(value)) {
          injectionCount++;
          injectionFields.add(key);
        }
      }
    }
    if (injectionCount > 0) {
      warnings.push({
        field: 'content',
        message: `Detected ${injectionCount} cell(s) starting with =, +, -, or @ which may indicate CSV injection. ` +
          `Affected columns: ${[...injectionFields].slice(0, 5).join(', ')}. ` +
          `Cells will be sanitized during export to prevent formula execution.`,
        code: 'CSV_INJECTION_WARNING',
        details: { injectionCount, affectedColumns: [...injectionFields] },
      });
    }
  }

  private buildResult(
    errors: ValidationError[],
    warnings: ValidationError[]
  ): ValidationResult {
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      errorCount: errors.length,
      warningCount: warnings.length,
    };
  }
}
