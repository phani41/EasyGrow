export type CrmStatus =
  | 'GOOD_LEAD_FOLLOW_UP'
  | 'DID_NOT_CONNECT'
  | 'BAD_LEAD'
  | 'SALE_DONE';

export type DataSource =
  | 'leads_on_demand'
  | 'meridian_tower'
  | 'eden_park'
  | 'varah_swamy'
  | 'sarjapur_plots'
  | '';

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
  data_source: DataSource;
  possession_time: string;
  description: string;
}

export const CRM_STATUS_OPTIONS: readonly CrmStatus[] = [
  'GOOD_LEAD_FOLLOW_UP',
  'DID_NOT_CONNECT',
  'BAD_LEAD',
  'SALE_DONE',
] as const;

export const ALLOWED_DATA_SOURCES: readonly DataSource[] = [
  'leads_on_demand',
  'meridian_tower',
  'eden_park',
  'varah_swamy',
  'sarjapur_plots',
] as const;

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

export interface ImportSummary {
  totalProcessed: number;
  skippedNoContact: number;
  skippedInvalid: number;
  emailsExtracted: number;
  phonesExtracted: number;
}

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

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  requestId?: string;
}

export type DatasetType =
  | 'CRM Leads'
  | 'Customer Database'
  | 'Shopping Dataset'
  | 'Financial Dataset'
  | 'Student Dataset'
  | 'Employee Dataset'
  | 'Property Dataset'
  | 'Marketing Dataset'
  | 'Unknown';

export interface ColumnMapping {
  [csvHeader: string]: string;
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
  skippedFields: string[];
  cacheHit: boolean;
}

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
