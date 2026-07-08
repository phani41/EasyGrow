import { CsvRow, CrmRecord, ImportSummary, ColumnMapping, DatasetType, DatasetClassification, MappingResult } from '../types';
import { isValidEmail } from '../utils/helpers';
import { OpenRouterService } from './openrouter.service';

// ===== Types =====

interface MappingCacheEntry {
  mapping: ColumnMapping;
  datasetType: DatasetType;
  confidence: number;
  usedRuleBased: boolean;
  createdAt: number;
}

// ===== Constants =====

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const RULE_COVERAGE_THRESHOLD = 0.6; // 60% → skip AI (9/14 fields detected by rules is sufficient)
const MIN_CONFIDENCE_FOR_CRM = 80;
const CRM_FIELD_COUNT = 14; // Total number of CRM schema fields

// ===== Rule Patterns =====

interface FieldRule {
  patterns: RegExp[];
  field: string;
  transform?: (value: string, row: CsvRow, allValues: string[]) => string;
}

/**
 * Rule-based field detection patterns.
 * Each CRM field has a set of regex patterns to match against CSV headers.
 * Order matters: more specific patterns should come first.
 */
const FIELD_RULES: FieldRule[] = [
  {
    patterns: [/^email$/i, /^e[\s-]?mail$/i, /^email[\s_]address$/i, /^e[\s-]?mail[\s_]address$/i, /^mail$/i, /^mail[\s_]id$/i, /email[\s_]id$/i, /e[\s_]mail/i, /^email[\s_]address/i],
    field: 'email',
  },
  {
    patterns: [/^phone$/i, /^phone[\s_]number$/i, /^mobile$/i, /^mobile[\s_]number$/i, /^contact$/i, /^contact[\s_]no$/i, /^telephone$/i, /^tel$/i, /^cell$/i, /^phone[\s_]no$/i, /^mobile[\s_]no$/i, /^contact[\s_]number$/i],
    field: 'mobile_without_country_code',
  },
  {
    patterns: [/^country[\s_]code$/i, /^dial[\s_]code$/i, /^phone[\s_]code$/i],
    field: 'country_code',
  },
  {
    patterns: [/^full[\s_]name$/i, /^customer[\s_]name$/i, /^person[\s_]name$/i, /^contact[\s_]name$/i, /^applicant[\s_]name$/i, /^name$/i, /^first[\s_]name$/i, /^last[\s_]name$/i, /^firstname$/i, /^lastname$/i, /^fullname$/i, /^applicant$/i],
    field: 'name',
  },
  {
    patterns: [/^company$/i, /^company[\s_]name$/i, /^organization$/i, /^organization[\s_]name$/i, /^firm$/i, /^business$/i, /^employer$/i, /^org$/i],
    field: 'company',
  },
  {
    patterns: [/^city$/i, /^town$/i, /^municipality$/i, /^location[\s_]city/i, /^city[\s_]town$/i],
    field: 'city',
  },
  {
    patterns: [/^state$/i, /^province$/i, /^region$/i, /^county$/i, /^state[\s_]province$/i],
    field: 'state',
  },
  {
    patterns: [/^country$/i, /^nation$/i, /^country[\s_]name$/i, /^nationality$/i, /^country[\s_]region$/i],
    field: 'country',
  },
  {
    patterns: [/^lead[\s_]owner$/i, /^owner$/i, /^assigned[\s_]to$/i, /^sales[\s_]rep$/i, /^account[\s_]manager$/i, /^sales[\s_]representative$/i],
    field: 'lead_owner',
  },
  {
    patterns: [/^crm[\s_]status$/i, /^lead[\s_]status$/i, /^status$/i],
    field: 'crm_status',
  },
  {
    patterns: [/^description$/i, /^notes$/i, /^note$/i, /^comments$/i, /^comment$/i, /^additional[\s_]info/i, /^additional[\s_]information/i],
    field: 'description',
  },
  {
    patterns: [/^created[\s_]at$/i, /^created$/i, /^date$/i, /^created[\s_]date$/i, /^timestamp$/i, /^registration[\s_]date$/i, /^signup[\s_]date$/i, /^sign.?up[\s_]date/i],
    field: 'created_at',
  },
  {
    patterns: [/^possession[\s_]time$/i, /^possession$/i],
    field: 'possession_time',
  },
];

// ===== Dataset Classification Rules =====

interface DatasetRule {
  type: DatasetType;
  keywords: string[];
  weight: number; // How strongly this indicates the type
}

const DATASET_RULES: DatasetRule[] = [
  { type: 'CRM Leads', keywords: ['email', 'e-mail', 'mail', 'phone', 'mobile', 'name', 'company', 'lead', 'contact'], weight: 1 },
  { type: 'Customer Database', keywords: ['customer', 'account', 'membership', 'customer id', 'member', 'subscription'], weight: 1 },
  { type: 'Shopping Dataset', keywords: ['product', 'price', 'quantity', 'order', 'category', 'sku', 'item', 'total', 'subtotal', 'shipping', 'payment'], weight: 1 },
  { type: 'Financial Dataset', keywords: ['transaction', 'amount', 'payment', 'invoice', 'tax', 'balance', 'account', 'debit', 'credit', 'fee', 'interest'], weight: 1 },
  { type: 'Student Dataset', keywords: ['student', 'grade', 'course', 'class', 'subject', 'enrollment', 'gpa', 'semester', 'exam', 'score'], weight: 1 },
  { type: 'Employee Dataset', keywords: ['employee', 'salary', 'department', 'position', 'hire', 'termination', 'payroll', 'manager', 'title', 'job'], weight: 1 },
];

// ===== Local Transformation Functions =====

/**
 * Map CRM status text to allowed values.
 */
function normalizeCrmStatus(value: string): string {
  if (!value) return '';
  const v = value.toLowerCase().trim();

  if (/^(new|lead|uncontacted)$/i.test(v)) return 'new';
  if (/^(contacted|reached)$/i.test(v)) return 'contacted';
  if (/^(qualified|interested|hot|warm)$/i.test(v)) return 'qualified';
  if (/^(proposal|quote|quoted)$/i.test(v)) return 'proposal';
  if (/^(negotiation|undecided|reviewing)$/i.test(v)) return 'negotiation';
  if (/^(closed.?won|won|customer|sold)$/i.test(v)) return 'closed_won';
  if (/^(closed.?lost|lost|dead)$/i.test(v)) return 'closed_lost';
  if (/^(follow.?up|followup)$/i.test(v)) return 'follow_up';

  return '';
}

/**
 * Parse date string to ISO 8601.
 */
function normalizeDate(value: string): string {
  if (!value) return '';
  const v = value.trim();

  // Try to parse common date formats
  const trimmed = v.replace(/[^0-9T:\-\/\s.]/g, '').trim();

  // ISO 8601 format: 2024-01-15 or 2024-01-15T10:30:00.000Z
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (isoMatch) {
    const [, y, m, d, h, min, s] = isoMatch;
    return `${y}-${m}-${d}T${h}:${min}:${s || '00'}.000Z`;
  }

  // Date-only ISO: 2024-01-15
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    return `${y}-${m}-${d}T00:00:00.000Z`;
  }

  // US format: 01/15/2024 or 01/15/24
  const usDateMatch = trimmed.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})$/);
  if (usDateMatch) {
    let [, mon, day, year] = usDateMatch;
    // Heuristic: if first part > 12, it's DD/MM (not US)
    if (parseInt(mon, 10) > 12) {
      [mon, day] = [day, mon]; // Swap — it's DD/MM
    }
    if (year.length === 2) {
      year = '20' + year;
    }
    return `${year}-${mon.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00.000Z`;
  }

  // EU format: 15/01/2024
  const euDateMatch = trimmed.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (euDateMatch) {
    const [, day, mon, year] = euDateMatch;
    return `${year}-${mon.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00.000Z`;
  }

  // Try native Date parsing as fallback
  const ts = Date.parse(v);
  if (!isNaN(ts)) {
    return new Date(ts).toISOString();
  }

  return v; // Return as-is if we can't parse
}

/**
 * Clean phone number: strip all non-digit characters.
 */
function cleanPhone(value: string): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

/**
 * Extract country code from phone number if present and no separate column.
 */
function extractCountryCode(digits: string): { countryCode: string; phoneDigits: string } {
  if (digits.length > 10) {
    // Could have country code prefix
    // Common country code lengths: 1-3 digits
    // Try extracting 1-3 digit prefix
    for (let len = 1; len <= 3; len++) {
      const prefix = digits.substring(0, len);
      const rest = digits.substring(len);
      // If the rest looks like a valid phone number (7-15 digits)
      if (rest.length >= 7 && rest.length <= 15) {
        return { countryCode: prefix, phoneDigits: rest };
      }
    }
  }
  return { countryCode: '', phoneDigits: digits };
}

// ===== Helper Functions =====

/**
 * Get headers key for cache lookup (sorted, lowercased, trimmed).
 */
function getCacheKey(headers: string[]): string {
  return headers
    .map((h) => h.toLowerCase().trim())
    .sort()
    .join('||');
}

// ===== Dataset Classification =====

/**
 * Classify the dataset type based on headers and sample data.
 * Uses keyword matching with scoring per dataset type.
 */
function classifyDataset(headers: string[], sampleRows: CsvRow[]): DatasetClassification {
  const headerLower = headers.map((h) => h.toLowerCase().trim());
  const scores = new Map<DatasetType, number>();

  // Initialize scores
  for (const rule of DATASET_RULES) {
    scores.set(rule.type, 0);
  }

  // Score based on header keyword matches
  for (const rule of DATASET_RULES) {
    let matchCount = 0;
    for (const keyword of rule.keywords) {
      for (const header of headerLower) {
        if (header.includes(keyword) || header.replace(/[\s_-]/g, '').includes(keyword.replace(/[\s_-]/g, ''))) {
          matchCount++;
          break; // Only count once per keyword even if it matches multiple headers
        }
      }
    }
    const score = Math.min(100, Math.round((matchCount / Math.max(rule.keywords.length, 1)) * 100));
    scores.set(rule.type, score * rule.weight);
  }

  // Find the best match
  let bestType: DatasetType = 'Unknown';
  let bestScore = 0;

  for (const [type, score] of scores.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  // CRM-specific boost: if email and phone/name are detected, boost CRM score
  const hasEmail = headerLower.some((h) => /^email/i.test(h) || /^e[\s-]?mail/i.test(h));
  const hasPhone = headerLower.some((h) => /^phone/i.test(h) || /^mobile/i.test(h));
  const hasName = headerLower.some((h) => /^name/i.test(h) || /full.?name/i.test(h));

  if (hasEmail && (hasPhone || hasName)) {
    const crmScore = (scores.get('CRM Leads') || 0) + 30;
    scores.set('CRM Leads', crmScore);
    if (crmScore > bestScore) {
      bestScore = crmScore;
      bestType = 'CRM Leads';
    }
  }

  // Normalize confidence
  let confidence = Math.min(100, bestScore);

  // Build reasoning
  const matchedKeywords = DATASET_RULES
    .filter((r) => r.type === bestType)
    .flatMap((r) => r.keywords)
    .filter((kw) => headerLower.some((h) => h.includes(kw)))
    .slice(0, 5);

  const reasoning = matchedKeywords.length > 0
    ? `Found matching keywords: ${matchedKeywords.join(', ')}`
    : 'No strong signals detected';

  return {
    datasetType: bestType,
    confidence,
    reasoning,
  };
}

// ===== Rule-Based Field Detection =====

/**
 * Detect CRM fields using regex rules on CSV headers.
 * Returns the detected mapping and coverage percentage.
 */
function detectFieldsByRules(headers: string[]): { mapping: ColumnMapping; coverage: number; skippedFields: string[] } {
  const mapping: ColumnMapping = {};
  const assignedFields = new Set<string>();
  const usedHeaders = new Set<string>();

  // First pass: match all headers to rules
  for (const header of headers) {
    let matched = false;
    for (const rule of FIELD_RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(header.trim())) {
          mapping[header] = rule.field;
          assignedFields.add(rule.field);
          usedHeaders.add(header);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) {
      mapping[header] = '';
    }
  }

  // Calculate coverage: ratio of non-empty mappings to total CRM fields
  const nonEmptyMappings = assignedFields.size;
  const coverage = nonEmptyMappings / CRM_FIELD_COUNT;

  const skippedFields = headers.filter((h) => mapping[h] === '');

  return { mapping, coverage, skippedFields };
}

// ===== Local Record Transformation =====

/**
 * Transform a single CSV row into a CRM record using the column mapping.
 * All validation, normalization, and transformation happens locally.
 */
function transformRow(
  row: CsvRow,
  headers: string[],
  mapping: ColumnMapping,
  dataSource: string
): CrmRecord | null {
  const get = (header: string): string => (row[header]?.trim() ?? '');

  // Collect all values for each CRM field
  const fieldValues = new Map<string, string[]>();
  for (const header of headers) {
    const field = mapping[header];
    if (field && field !== '') {
      if (!fieldValues.has(field)) {
        fieldValues.set(field, []);
      }
      const val = get(header);
      if (val) {
        fieldValues.get(field)!.push(val);
      }
    }
  }

  // Extract primary and extra values
  const getPrimary = (field: string): string => {
    const vals = fieldValues.get(field);
    return vals && vals.length > 0 ? vals[0] : '';
  };

  const getExtra = (field: string, primaryField: string): string => {
    const primary = getPrimary(primaryField);
    const vals = (fieldValues.get(field) || []).filter((v) => v !== primary);
    return vals.join(', ');
  };

  // --- Extract and normalize fields ---

  // Email
  const rawEmail = getPrimary('email').toLowerCase().trim();
  const email = isValidEmail(rawEmail) ? rawEmail : '';

  // Name (combine if multiple sources, e.g. first_name + last_name)
  const nameParts = fieldValues.get('name') || [];
  let name = nameParts.join(' ').trim();
  // Remove excessive whitespace
  name = name.replace(/\s+/g, ' ');

  // Phone
  const rawPhone = getPrimary('mobile_without_country_code');
  const phoneDigits = cleanPhone(rawPhone);

  // Country code
  let countryCode = getPrimary('country_code');
  let phoneDigitsFinal = phoneDigits;

  if (!countryCode && phoneDigits.length > 10) {
    const extracted = extractCountryCode(phoneDigits);
    countryCode = extracted.countryCode;
    phoneDigitsFinal = extracted.phoneDigits;
  }

  // Check if we have at least email or phone
  const hasContact = email !== '' || phoneDigitsFinal !== '';

  if (!hasContact) {
    return null; // Skip this row
  }

  // Company
  const company = getPrimary('company');

  // City / State / Country
  const city = getPrimary('city');
  const state = getPrimary('state');
  const country = getPrimary('country');

  // Lead owner
  const leadOwner = getPrimary('lead_owner');

  // CRM Status
  const rawStatus = getPrimary('crm_status');
  const crmStatus = normalizeCrmStatus(rawStatus);

  // Created At
  const rawDate = getPrimary('created_at');
  const createdAt = normalizeDate(rawDate);

  // Description
  const description = getPrimary('description');

  // Possession Time
  const possessionTime = getPrimary('possession_time');

  // CRM Note — collect extra values from multiple-mapped fields
  const noteParts: string[] = [];

  // Extra emails (beyond the first)
  const extraEmails = getExtra('email', 'email');
  if (extraEmails) noteParts.push(`Extra email: ${extraEmails}`);

  // Extra phones (beyond the first)
  const extraPhones = getExtra('mobile_without_country_code', 'mobile_without_country_code');
  if (extraPhones) noteParts.push(`Extra phone: ${extraPhones}`);

  // Extra data from unmapped or crm_note-mapped headers
  const noteValues = fieldValues.get('crm_note');
  if (noteValues && noteValues.length > 0) {
    noteParts.push(noteValues.join(', '));
  }

  const crmNote = noteParts.join(' | ');

  return {
    created_at: createdAt,
    name,
    email,
    country_code: countryCode,
    mobile_without_country_code: phoneDigitsFinal,
    company,
    city,
    state,
    country,
    lead_owner: leadOwner,
    crm_status: crmStatus as CrmRecord['crm_status'],
    crm_note: crmNote,
    data_source: dataSource,
    possession_time: possessionTime,
    description,
  };
}

// ===== Mapping Service =====

export class MappingService {
  private mappingCache: Map<string, MappingCacheEntry>;
  private openrouterService: OpenRouterService;

  constructor(openrouterService: OpenRouterService) {
    this.mappingCache = new Map();
    this.openrouterService = openrouterService;

    // Periodic cache cleanup
    setInterval(() => this.cleanupCache(), 10 * 60 * 1000).unref();
  }

  /**
   * Main entry point: get column mapping for a CSV dataset.
   * 1. Check cache
   * 2. Run rule-based detection
   * 3. If rules cover >70% of fields, use rules (skip AI)
   * 4. Otherwise, call AI for mapping
   * 5. Cache result
   */
  async getMapping(
    headers: string[],
    rows: CsvRow[],
  ): Promise<MappingResult> {
    const cacheKey = getCacheKey(headers);

    // 1. Check cache
    const cached = this.mappingCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      console.log(`[MappingService] Cache hit for headers (${headers.length} columns)`);
      return {
        mapping: cached.mapping,
        confidence: cached.confidence,
        datasetType: cached.datasetType,
        usedRuleBased: cached.usedRuleBased,
        skippedFields: headers.filter((h) => cached.mapping[h] === ''),
        cacheHit: true,
      };
    }

    // 2. Run rule-based detection first
    const { mapping: ruleMapping, coverage, skippedFields } = detectFieldsByRules(headers);

    // 3. Check if rules cover enough
    if (coverage >= RULE_COVERAGE_THRESHOLD) {
      console.log(
        `[MappingService] Rule-based detection covered ${(coverage * 100).toFixed(0)}% of fields — skipping AI`
      );

      // Also classify dataset
      const classification = classifyDataset(headers, rows.slice(0, 5));
      const confidence = Math.round(coverage * 100);

      const result: MappingResult = {
        mapping: ruleMapping,
        confidence,
        datasetType: classification.datasetType,
        usedRuleBased: true,
        skippedFields,
        cacheHit: false,
      };

      // Cache it
      this.mappingCache.set(cacheKey, {
        mapping: result.mapping,
        datasetType: result.datasetType,
        confidence: result.confidence,
        usedRuleBased: true,
        createdAt: Date.now(),
      });

      return result;
    }

    // 4. Call AI for mapping
    console.log(
      `[MappingService] Rule-based detection covered ${(coverage * 100).toFixed(0)}% — calling AI for mapping`
    );

    const sampleRows = rows.slice(0, 5);
    const aiResult = await this.openrouterService.getColumnMapping(headers, sampleRows);

    // Merge AI mapping with rule-based detection for headers the AI might have missed
    const mergedMapping: ColumnMapping = { ...aiResult.mapping };
    for (const header of headers) {
      if (!(header in mergedMapping) || mergedMapping[header] === '') {
        // Use rule-based result as fallback
        if (ruleMapping[header] && ruleMapping[header] !== '') {
          mergedMapping[header] = ruleMapping[header];
        } else if (!(header in mergedMapping)) {
          mergedMapping[header] = '';
        }
      }
    }

    const aiSkippedFields = headers.filter((h) => mergedMapping[h] === '');

    const result: MappingResult = {
      mapping: mergedMapping,
      confidence: aiResult.confidence,
      datasetType: aiResult.datasetType,
      usedRuleBased: false,
      skippedFields: aiSkippedFields,
      cacheHit: false,
    };

    // 5. Cache result
    this.mappingCache.set(cacheKey, {
      mapping: result.mapping,
      datasetType: result.datasetType,
      confidence: result.confidence,
      usedRuleBased: false,
      createdAt: Date.now(),
    });

    return result;
  }

  /**
   * Classify the dataset type from headers and sample rows.
   * Used before mapping to check compatibility.
   */
  classifyDataset(headers: string[], rows: CsvRow[]): DatasetClassification {
    return classifyDataset(headers, rows.slice(0, 5));
  }

  /**
   * Check if the dataset is compatible with CRM import.
   * Returns true if:
   * 1. Dataset type is CRM-compatible (CRM Leads, Customer Database, or Unknown)
   * 2. Required fields (email, phone) are present in the mapping
   *
   * OR if the dataset type is non-CRM but confidence is low (< 80%)
   */
  isDatasetCompatible(classification: DatasetClassification): { compatible: boolean; reason?: string } {
    const incompatibleTypes: DatasetType[] = ['Shopping Dataset', 'Financial Dataset', 'Student Dataset', 'Employee Dataset'];

    if (incompatibleTypes.includes(classification.datasetType) && classification.confidence >= MIN_CONFIDENCE_FOR_CRM) {
      return {
        compatible: false,
        reason: `This dataset appears to be a "${classification.datasetType}" (${classification.confidence}% confidence) and is not compatible with CRM import. Please upload a CRM-related dataset (leads, customers, contacts).`,
      };
    }

    return { compatible: true };
  }

  /**
   * Check if required CRM fields exist in the mapping.
   * Required: email OR phone must map to something.
   */
  hasRequiredFields(mapping: ColumnMapping): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    const mappedFields = Object.values(mapping);

    if (!mappedFields.includes('email') && !mappedFields.includes('mobile_without_country_code')) {
      missing.push('email', 'mobile_without_country_code');
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Apply a column mapping to ALL rows locally — NO AI calls.
   * This is where the bulk transformation happens.
   */
  applyMapping(
    rows: CsvRow[],
    headers: string[],
    mapping: ColumnMapping,
    mappingResult: MappingResult,
    dataSource: string,
  ): { records: CrmRecord[]; summary: ImportSummary } {
    const records: CrmRecord[] = [];
    let skippedNoContact = 0;
    let skippedInvalid = 0;
    let emailsExtracted = 0;
    let phonesExtracted = 0;

    for (const row of rows) {
      const record = transformRow(row, headers, mapping, dataSource);

      if (record === null) {
        skippedNoContact++;
        continue;
      }

      if (record.email) emailsExtracted++;
      if (record.mobile_without_country_code) phonesExtracted++;

      records.push(record);
    }

    return {
      records,
      summary: {
        totalProcessed: records.length,
        skippedNoContact,
        skippedInvalid,
        emailsExtracted,
        phonesExtracted,
      },
    };
  }

  /**
   * Apply mapping in local batches (for SSE streaming progress).
   * Processes rows in chunks and invokes callbacks for each chunk.
   */
  applyMappingInBatches(
    rows: CsvRow[],
    headers: string[],
    mapping: ColumnMapping,
    mappingResult: MappingResult,
    dataSource: string,
    batchSize: number = 500,
    onBatchComplete?: (batchIndex: number, totalBatches: number, records: CrmRecord[], cumulativeSummary: ImportSummary) => void,
  ): { records: CrmRecord[]; summary: ImportSummary } {
    const allRecords: CrmRecord[] = [];
    const cumulativeSummary: ImportSummary = {
      totalProcessed: 0,
      skippedNoContact: 0,
      skippedInvalid: 0,
      emailsExtracted: 0,
      phonesExtracted: 0,
    };

    const totalBatches = Math.ceil(rows.length / batchSize);

    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, rows.length);
      const batchRows = rows.slice(start, end);

      const { records: batchRecords, summary: batchSummary } = this.applyMapping(
        batchRows,
        headers,
        mapping,
        mappingResult,
        dataSource,
      );

      allRecords.push(...batchRecords);
      cumulativeSummary.totalProcessed += batchSummary.totalProcessed;
      cumulativeSummary.skippedNoContact += batchSummary.skippedNoContact;
      cumulativeSummary.skippedInvalid += batchSummary.skippedInvalid;
      cumulativeSummary.emailsExtracted += batchSummary.emailsExtracted;
      cumulativeSummary.phonesExtracted += batchSummary.phonesExtracted;

      if (onBatchComplete) {
        onBatchComplete(i, totalBatches, batchRecords, { ...cumulativeSummary });
      }
    }

    return { records: allRecords, summary: cumulativeSummary };
  }

  /**
   * Clean up expired cache entries.
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.mappingCache.entries()) {
      if (now - entry.createdAt > CACHE_TTL_MS) {
        this.mappingCache.delete(key);
      }
    }
  }

  /**
   * Get cache stats for monitoring.
   */
  getCacheStats(): { size: number; entries: Array<{ datasetType: DatasetType; age: number }> } {
    const now = Date.now();
    const entries = Array.from(this.mappingCache.entries()).map(([key, entry]) => ({
      key,
      datasetType: entry.datasetType,
      age: Math.round((now - entry.createdAt) / 1000),
      usedRuleBased: entry.usedRuleBased,
    }));

    return { size: this.mappingCache.size, entries };
  }

  /**
   * Clear the mapping cache.
   */
  clearCache(): void {
    this.mappingCache.clear();
    console.log('[MappingService] Cache cleared');
  }
}
