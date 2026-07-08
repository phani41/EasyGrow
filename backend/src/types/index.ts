// ===== Crm Record Types =====

export type CrmStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost'
  | 'follow_up';

export interface CrmRecord {
  created_at: string;
  name: string;
  email: string;
  country_code: string;
  mobile_without_country_code: string;
  company: string;
  city: string;
  state: string;
  country: string;
  lead_owner: string;
  crm_status: CrmStatus | '';
  crm_note: string;
  data_source: string;
  possession_time: string;
  description: string;
}

export const CRM_STATUS_OPTIONS: readonly CrmStatus[] = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
  'follow_up',
] as const;

// ===== Csv Parsing Types =====

export interface CsvRow {
  [key: string]: string | undefined;
}

export interface ParsedCsvResponse {
  headers: string[];
  rows: CsvRow[];
  totalRows: number;
  fileId: string;
  fileName: string;
}

// ===== Upload Types =====

export interface UploadedFileInfo {
  id: string;
  originalName: string;
  path: string;
  size: number;
  mimetype: string;
}

export interface UploadResponse {
  success: boolean;
  fileId: string;
  fileName: string;
  totalRows: number;
  headers: string[];
}

// ===== AI Mapping Types =====

export interface AiMappingRequest {
  fileId: string;
  headers: string[];
  rows: CsvRow[];
  batchIndex?: number;
  totalBatches?: number;
}

export interface AiMappingResponse {
  success: boolean;
  records: CrmRecord[];
  batchIndex: number;
  totalBatches: number;
  summary: ImportSummary;
}

export interface ImportSummary {
  totalProcessed: number;
  skippedNoContact: number;
  skippedInvalid: number;
  emailsExtracted: number;
  phonesExtracted: number;
}

// ===== SSE Event Types =====

export interface BatchProgressEvent {
  type: 'batch-start' | 'batch-complete' | 'complete' | 'error';
  batchIndex?: number;
  totalBatches?: number;
  batchRecords?: CrmRecord[];
  allRecords?: CrmRecord[];
  cumulativeSummary?: ImportSummary;
  message?: string;
  error?: string;
}

// ===== Api Response Wrapper =====

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  requestId?: string;
}

// ===== Dataset Classification Types =====

export type DatasetType =
  | 'CRM Leads'
  | 'Customer Database'
  | 'Shopping Dataset'
  | 'Financial Dataset'
  | 'Student Dataset'
  | 'Employee Dataset'
  | 'Unknown';

export interface ColumnMapping {
  [csvHeader: string]: string; // Maps CSV header → CRM field name (or '' to skip)
}

export interface DatasetClassification {
  datasetType: DatasetType;
  confidence: number;
  reasoning: string;
}

export interface MappingResult {
  mapping: ColumnMapping;
  confidence: number;
  datasetType: DatasetType;
  usedRuleBased: boolean;
  skippedFields: string[]; // CSV headers that didn't map to any CRM field
  cacheHit: boolean;
}

// ===== Validation Types =====

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  errorCount: number;
  warningCount: number;
}

// ===== Error Types =====

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public validationResult?: ValidationResult;

  constructor(message: string, statusCode: number = 500, validationResult?: ValidationResult) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.validationResult = validationResult;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
