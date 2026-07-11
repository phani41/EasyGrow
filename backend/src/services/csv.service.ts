import fs from 'fs';
import csv from 'csv-parser';
import { CsvRow, ParsedCsvResponse, ValidationResult } from '../types';
import { generateFileId } from '../utils/helpers';
import { ValidationService } from './validation.service';

export class CsvService {
  private validationService: ValidationService;

  constructor() {
    this.validationService = new ValidationService();
  }

  async parseFile(
    filePath: string,
    fileName: string
  ): Promise<{ data: ParsedCsvResponse; validation: ValidationResult }> {
    return new Promise((resolve, reject) => {
      const rows: CsvRow[] = [];
      const headersSet = new Set<string>();
      const headerOrder: string[] = [];

      fs.createReadStream(filePath, { encoding: 'utf-8' })
        .on('error', (err) => reject(new Error(`Failed to read file: ${err.message}`)))
        .pipe(csv({
          mapHeaders: ({ header }: { header: string }) => {
            // BOM removal + trim
            return header.replace(/^\uFEFF/, '').trim();
          },
        }))
        .on('headers', (headers: string[]) => {
          for (const h of headers) {
            const trimmed = h.replace(/^\uFEFF/, '').trim();
            if (!headersSet.has(trimmed)) {
              headersSet.add(trimmed);
              headerOrder.push(trimmed);
            }
          }
        })
        .on('data', (row: CsvRow) => {
          // BOM-safe key trimming
          const cleanedRow: CsvRow = {};
          for (const [key, value] of Object.entries(row)) {
            const cleanKey = key.replace(/^\uFEFF/, '').trim();
            cleanedRow[cleanKey] = (value || '').trim();
          }
          rows.push(cleanedRow);
        })
        .on('end', () => {
          const parsed: ParsedCsvResponse = {
            headers: headerOrder,
            rows,
            totalRows: rows.length,
            fileId: generateFileId(),
            fileName,
          };

          // Validate the parsed content
          const validation = this.validationService.validateCsvContent(
            parsed.headers,
            parsed.rows
          );

          resolve({ data: parsed, validation });
        })
        .on('error', (err) =>
          reject(new Error(`CSV parsing error: ${err.message}`))
        );
    });
  }

  getBatch(
    rows: CsvRow[],
    batchIndex: number,
    batchSize: number
  ): CsvRow[] {
    const start = batchIndex * batchSize;
    const end = Math.min(start + batchSize, rows.length);
    return rows.slice(start, end);
  }

  getTotalBatches(totalRows: number, batchSize: number): number {
    return Math.ceil(totalRows / batchSize);
  }

  cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error(`[CsvService] Failed to clean up file ${filePath}:`, err);
    }
  }
}
