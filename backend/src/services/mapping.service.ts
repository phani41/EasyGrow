import { CsvRow, CrmRecord, ImportSummary, ColumnMapping, DatasetType, DatasetClassification, MappingResult, DataSource, ALLOWED_DATA_SOURCES } from '../types';
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
const RULE_COVERAGE_THRESHOLD = 0.5; // 50% — lowered from 60% to skip AI more often
const MIN_CONFIDENCE_FOR_CRM = 80;
const CRM_FIELD_COUNT = 14; // Total number of CRM schema fields

// ===== Rule Patterns =====

interface FieldRule {
  patterns: RegExp[];
  field: string;
}

/**
 * Rule-based field detection patterns.
 * Each CRM field has a set of regex patterns to match against CSV headers.
 * Order matters: more specific patterns should come first.
 * Extended with many common real-world CSV export patterns.
 */
const FIELD_RULES: FieldRule[] = [
  // Email
  {
    patterns: [
      /^email$/i, /^e[\s-]?mail$/i, /^email[\s_]address$/i, /^e[\s-]?mail[\s_]address$/i,
      /^mail$/i, /^mail[\s_]id$/i, /email[\s_]id$/i, /e[\s_]mail/i, /^email[\s_]address/i,
      /^email[\s_]addresses$/i, /^contact[\s_]email$/i, /^email[\s_]primary$/i,
      /^primary[\s_]email$/i, /^correo$/i, /^correo[\s_]electronico$/i,
    ],
    field: 'email',
  },
  // Phone / Mobile
  {
    patterns: [
      /^phone$/i, /^phone[\s_]number$/i, /^mobile$/i, /^mobile[\s_]number$/i,
      /^contact$/i, /^contact[\s_]no$/i, /^telephone$/i, /^tel$/i, /^cell$/i,
      /^phone[\s_]no$/i, /^mobile[\s_]no$/i, /^contact[\s_]number$/i,
      /^phone[\s_]1$/i, /^phone[\s_]2$/i, /^alternate[\s_]phone$/i,
      /^work[\s_]phone$/i, /^home[\s_]phone$/i, /^mobile[\s_]phone$/i,
      /^telefono$/i, /^celular$/i, /^cel$/i,
    ],
    field: 'mobile_without_country_code',
  },
  // Country Code
  {
    patterns: [
      /^country[\s_]code$/i, /^dial[\s_]code$/i, /^phone[\s_]code$/i,
      /^area[\s_]code$/i, /^calling[\s_]code$/i, /^isd[\s_]code$/i,
      /^phone[\s_]prefix$/i, /^country[\s_]prefix$/i,
    ],
    field: 'country_code',
  },
  // Name
  {
    patterns: [
      /^full[\s_]name$/i, /^customer[\s_]name$/i, /^person[\s_]name$/i,
      /^contact[\s_]name$/i, /^applicant[\s_]name$/i, /^name$/i,
      /^first[\s_]name$/i, /^last[\s_]name$/i, /^firstname$/i, /^lastname$/i,
      /^fullname$/i, /^applicant$/i, /^given[\s_]name$/i, /^family[\s_]name$/i,
      /^surname$/i, /^forename$/i, /^middle[\s_]name$/i,
      /^first[\s_]given[\s_]name$/i, /^last[\s_]family[\s_]name$/i,
      /^contact[\s_]person$/i, /^point[\s_]of[\s_]contact$/i,
    ],
    field: 'name',
  },
  // Company
  {
    patterns: [
      /^company$/i, /^company[\s_]name$/i, /^organization$/i,
      /^organization[\s_]name$/i, /^firm$/i, /^business$/i, /^employer$/i,
      /^org$/i, /^account$/i, /^account[\s_]name$/i, /^client$/i,
      /^client[\s_]name$/i, /^vendor$/i, /^vendor[\s_]name$/i,
      /^workspace$/i, /^team$/i, /^department$/i, /^branch$/i,
      /^legal[\s_]entity$/i, /^registered[\s_]company$/i,
    ],
    field: 'company',
  },
  // City
  {
    patterns: [
      /^city$/i, /^town$/i, /^municipality$/i, /^location[\s_]city/i,
      /^city[\s_]town$/i, /^city[\s_]name$/i, /^locality$/i,
      /^suburb$/i, /^district$/i, /^sector$/i, /^zone$/i,
    ],
    field: 'city',
  },
  // State
  {
    patterns: [
      /^state$/i, /^province$/i, /^region$/i, /^county$/i,
      /^state[\s_]province$/i, /^state[\s_]region$/i, /^prefecture$/i,
      /^territory$/i, /^administrative[\s_]area/i,
    ],
    field: 'state',
  },
  // Country
  {
    patterns: [
      /^country$/i, /^nation$/i, /^country[\s_]name$/i, /^nationality$/i,
      /^country[\s_]region$/i, /^sovereign[\s_]state$/i,
    ],
    field: 'country',
  },
  // Lead Owner
  {
    patterns: [
      /^lead[\s_]owner$/i, /^owner$/i, /^assigned[\s_]to$/i,
      /^sales[\s_]rep$/i, /^account[\s_]manager$/i,
      /^sales[\s_]representative$/i, /^agent$/i, /^handler$/i,
      /^responsible$/i, /^salesperson$/i, /^sales[\s_]person$/i,
      /^rep$/i, /^assignee$/i, /^managed[\s_]by$/i,
    ],
    field: 'lead_owner',
  },
  // CRM Status
  {
    patterns: [
      /^crm[\s_]status$/i, /^lead[\s_]status$/i, /^status$/i,
      /^pipeline[\s_]stage$/i, /^deal[\s_]stage$/i, /^stage$/i,
      /^opportunity[\s_]stage$/i, /^sales[\s_]stage$/i,
      /^lead[\s_]stage$/i, /^lifecycle[\s_]stage$/i,
    ],
    field: 'crm_status',
  },
  // Description
  {
    patterns: [
      /^description$/i, /^notes$/i, /^note$/i, /^comments$/i,
      /^comment$/i, /^additional[\s_]info/i, /^additional[\s_]information/i,
      /^remarks$/i, /^details$/i, /^summary$/i, /^feedback$/i,
      /^reason$/i, /^observations$/i, /^narration$/i,
    ],
    field: 'description',
  },
  // Created At / Date
  {
    patterns: [
      /^created[\s_]at$/i, /^created$/i, /^date$/i, /^created[\s_]date$/i,
      /^timestamp$/i, /^registration[\s_]date$/i, /^signup[\s_]date$/i,
      /^sign.?up[\s_]date/i, /^entry[\s_]date$/i, /^submission[\s_]date$/i,
      /^date[\s_]created$/i, /^created[\s_]on$/i, /^added[\s_]on$/i,
      /^added[\s_]date$/i, /^datetime$/i, /^date[\s_]time$/i,
    ],
    field: 'created_at',
  },
  // Possession Time
  {
    patterns: [
      /^possession[\s_]time$/i, /^possession$/i, /^tenure$/i,
      /^ownership[\s_]period$/i, /^holding[\s_]period$/i,
      /^occupancy$/i, /^possession[\s_]date$/i,
    ],
    field: 'possession_time',
  },
  // CRM Note (crm_note-specific only — general text patterns like notes/comments are handled by description)
  {
    patterns: [
      /^crm[\s_]note$/i, /^crm[\s_]notes$/i,
    ],
    field: 'crm_note',
  },
];

// ===== Dataset Classification Rules =====

interface DatasetRule {
  type: DatasetType;
  keywords: string[];
  weight: number;
}

const DATASET_RULES: DatasetRule[] = [
  { type: 'CRM Leads', keywords: ['email', 'e-mail', 'mail', 'phone', 'mobile', 'name', 'company', 'lead', 'contact', 'owner', 'status', 'pipeline'], weight: 1 },
  { type: 'Customer Database', keywords: ['customer', 'account', 'membership', 'customer id', 'member', 'subscription', 'loyalty'], weight: 1 },
  { type: 'Shopping Dataset', keywords: ['product', 'price', 'quantity', 'order', 'category', 'sku', 'item', 'total', 'subtotal', 'shipping', 'payment', 'cart', 'invoice', 'billing'], weight: 1 },
  { type: 'Financial Dataset', keywords: ['transaction', 'amount', 'payment', 'invoice', 'tax', 'balance', 'account', 'debit', 'credit', 'fee', 'interest', 'loan', 'emi', 'installment'], weight: 1 },
  { type: 'Student Dataset', keywords: ['student', 'grade', 'course', 'class', 'subject', 'enrollment', 'gpa', 'semester', 'exam', 'score', 'roll', 'admission'], weight: 1 },
  { type: 'Employee Dataset', keywords: ['employee', 'salary', 'department', 'position', 'hire', 'termination', 'payroll', 'manager', 'title', 'job', 'designation', 'ctc'], weight: 1 },
  { type: 'Property Dataset', keywords: ['property', 'plot', 'sqft', 'area', 'land', 'building', 'apartment', 'flat', 'unit', 'floor', 'bedroom', 'bathroom', 'amenities', 'facing', 'possession', 'carpet'], weight: 1 },
  { type: 'Marketing Dataset', keywords: ['campaign', 'source', 'medium', 'channel', 'click', 'impression', 'conversion', 'ad', 'traffic', 'lead source', 'utm', 'referral'], weight: 1 },
];

// ===== Local Transformation Functions =====

/**
 * Map CRM status text to assignment-required values.
 */
function normalizeCrmStatus(value: string): string {
  if (!value) return '';
  const v = value.toLowerCase().trim();

  // Map common status texts to assignment statuses
  // GOOD_LEAD_FOLLOW_UP
  if (/^(new|lead|uncontacted|fresh|good|qualified|interested|hot|warm|follow.?up|followup|pending|open)$/i.test(v)) return 'GOOD_LEAD_FOLLOW_UP';
  // DID_NOT_CONNECT
  if (/^(contacted|reached|no.?answer|no.?response|unreachable|not.?connected|busy|switched.?off|wrong.?number|invalid.?contact)$/i.test(v)) return 'DID_NOT_CONNECT';
  // BAD_LEAD
  if (/^(bad|not.?interested|not.?qualified|disqualified|closed.?lost|lost|dead|rejected|unsubscribe|spam|junk|not.?now|never.?contact)$/i.test(v)) return 'BAD_LEAD';
  // SALE_DONE
  if (/^(sale.?done|won|closed.?won|customer|sold|converted|deal.?closed|purchased|booked|registered|done|completed|success)$/i.test(v)) return 'SALE_DONE';

  // If value looks like the old status system, try to convert
  if (v === 'new' || v === 'lead' || v === 'uncontacted') return 'GOOD_LEAD_FOLLOW_UP';
  if (v === 'contacted' || v === 'reached') return 'DID_NOT_CONNECT';
  if (v === 'qualified' || v === 'interested' || v === 'proposal' || v === 'negotiation') return 'GOOD_LEAD_FOLLOW_UP';
  if (v === 'closed_lost' || v === 'bad') return 'BAD_LEAD';
  if (v === 'closed_won' || v === 'sold') return 'SALE_DONE';
  if (v === 'follow_up') return 'GOOD_LEAD_FOLLOW_UP';

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
    if (parseInt(mon, 10) > 12) {
      [mon, day] = [day, mon];
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

  return v;
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
    for (let len = 1; len <= 3; len++) {
      const prefix = digits.substring(0, len);
      const rest = digits.substring(len);
      if (rest.length >= 7 && rest.length <= 15) {
        return { countryCode: prefix, phoneDigits: rest };
      }
    }
  }
  return { countryCode: '', phoneDigits: digits };
}

/**
 * Detect data source from filename patterns.
 * Maps CSV filenames to the assignment-required data sources.
 */
function detectDataSource(fileName: string): DataSource {
  if (!fileName) return '';
  const name = fileName.toLowerCase().trim();

  if (name.includes('leads_on_demand') || name.includes('leadsondemand') || name.includes('leads on demand')) return 'leads_on_demand';
  if (name.includes('meridian_tower') || name.includes('meridiantower') || name.includes('meridian tower')) return 'meridian_tower';
  if (name.includes('eden_park') || name.includes('edenpark') || name.includes('eden park')) return 'eden_park';
  if (name.includes('varah_swamy') || name.includes('varahswamy') || name.includes('varah swamy') || name.includes('varahaswamy')) return 'varah_swamy';
  if (name.includes('sarjapur_plots') || name.includes('sarjapurplots') || name.includes('sarjapur plots') || name.includes('sarjapur')) return 'sarjapur_plots';

  return '';
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

function classifyDataset(headers: string[], sampleRows: CsvRow[]): DatasetClassification {
  const headerLower = headers.map((h) => h.toLowerCase().trim());
  const scores = new Map<DatasetType, number>();

  for (const rule of DATASET_RULES) {
    scores.set(rule.type, 0);
  }

  for (const rule of DATASET_RULES) {
    let matchCount = 0;
    for (const keyword of rule.keywords) {
      for (const header of headerLower) {
        if (header.includes(keyword) || header.replace(/[\s_-]/g, '').includes(keyword.replace(/[\s_-]/g, ''))) {
          matchCount++;
          break;
        }
      }
    }
    const score = Math.min(100, Math.round((matchCount / Math.max(rule.keywords.length, 1)) * 100));
    scores.set(rule.type, score * rule.weight);
  }

  let bestType: DatasetType = 'Unknown';
  let bestScore = 0;

  for (const [type, score] of scores.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  // CRM-specific boost
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

  const confidence = Math.min(100, bestScore);

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

function detectFieldsByRules(headers: string[]): { mapping: ColumnMapping; coverage: number; skippedFields: string[] } {
  const mapping: ColumnMapping = {};
  const assignedFields = new Set<string>();

  for (const header of headers) {
    let matched = false;
    for (const rule of FIELD_RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(header.trim())) {
          mapping[header] = rule.field;
          assignedFields.add(rule.field);
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

  const nonEmptyMappings = assignedFields.size;
  const coverage = nonEmptyMappings / CRM_FIELD_COUNT;
  const skippedFields = headers.filter((h) => mapping[h] === '');

  return { mapping, coverage, skippedFields };
}

// ===== Local Record Transformation =====

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

  // Name (combine if multiple sources)
  const nameParts = fieldValues.get('name') || [];
  let name = nameParts.join(' ').trim();
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
    return null;
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

  // Extra data from crm_note-mapped headers
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
    data_source: dataSource as CrmRecord['data_source'],
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
    setInterval(() => this.cleanupCache(), 10 * 60 * 1000).unref();
  }

  /**
   * Detect the data source from the file name.
   * Validates against the allowed list; returns '' for unknown sources.
   */
  detectDataSourceFromFile(fileName: string): DataSource {
    const detected = detectDataSource(fileName);
    if (detected && (ALLOWED_DATA_SOURCES as readonly string[]).includes(detected)) {
      return detected;
    }
    return '';
  }

  /**
   * Main entry point: get column mapping for a CSV dataset.
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

    // Merge AI mapping with rule-based detection
    const mergedMapping: ColumnMapping = { ...aiResult.mapping };
    for (const header of headers) {
      if (!(header in mergedMapping) || mergedMapping[header] === '') {
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

    this.mappingCache.set(cacheKey, {
      mapping: result.mapping,
      datasetType: result.datasetType,
      confidence: result.confidence,
      usedRuleBased: false,
      createdAt: Date.now(),
    });

    return result;
  }

  classifyDataset(headers: string[], rows: CsvRow[]): DatasetClassification {
    return classifyDataset(headers, rows.slice(0, 5));
  }

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

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.mappingCache.entries()) {
      if (now - entry.createdAt > CACHE_TTL_MS) {
        this.mappingCache.delete(key);
      }
    }
  }

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

  clearCache(): void {
    this.mappingCache.clear();
    console.log('[MappingService] Cache cleared');
  }
}
