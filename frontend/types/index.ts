// ===== Crm Types =====

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

// ===== Api Types =====

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface UploadPreviewData {
  fileId: string;
  fileName: string;
  totalRows: number;
  headers: string[];
  previewRows: Record<string, string | undefined>[];
  validation?: UploadValidation;
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

export interface MapResponseData {
  records: CrmRecord[];
  totalProcessed: number;
  totalBatches: number;
  summary: ImportSummary;
  datasetType?: DatasetType;
  confidence?: number;
  usedRuleBased?: boolean;
  cacheHit?: boolean;
}

export interface MappingInfo {
  datasetType: DatasetType;
  confidence: number;
  usedRuleBased: boolean;
  cacheHit: boolean;
}

export interface ImportSummary {
  totalProcessed: number;
  skippedNoContact: number;
  skippedInvalid: number;
  emailsExtracted: number;
  phonesExtracted: number;
}

// ===== Validation Types =====

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

export interface UploadValidation {
  warnings: ValidationWarning[];
  warningCount: number;
}

// ===== SSE Event Types =====

export interface SseProgressEvent {
  type: 'batch-start' | 'batch-complete' | 'complete' | 'error' | 'mapping-start' | 'mapping-complete';
  batchIndex?: number;
  totalBatches?: number;
  batchRecords?: CrmRecord[];
  allRecords?: CrmRecord[];
  cumulativeSummary?: ImportSummary;
  message?: string;
  error?: string;
  mappingInfo?: MappingInfo;
}

// ===== UI State Types =====

export type UploadState = 'idle' | 'uploading' | 'preview' | 'processing' | 'complete' | 'error';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}
