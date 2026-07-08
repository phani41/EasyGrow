import { sanitizeForPrompt } from '../utils/helpers';

/**
 * Build a prompt that asks the AI to classify the dataset and return a column mapping
 * (CSV headers → CRM fields). The AI should NEVER process individual records.
 *
 * Input: CSV headers + up to 5 sample rows
 * Output: { mapping: { "CSV Header": "crm_field" }, datasetType: "...", confidence: 0-100 }
 */
export const buildColumnMappingPrompt = (
  headers: string[],
  sampleRows: Record<string, string | undefined>[]
): string => {
  const sanitizedHeaders = headers.map((h) =>
    typeof h === 'string' ? h.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') : h
  );
  // Strip HTML tags from sample values to prevent HTML-based prompt injection
  // (Markdown characters are legitimate data and preserved for AI understanding)
  const sanitizedSamples = sanitizeForPrompt(sampleRows.slice(0, 5)).map(
    (row: Record<string, string | undefined>) => {
      const cleaned: Record<string, string | undefined> = {};
      for (const [key, val] of Object.entries(row)) {
        if (typeof val === 'string') {
          cleaned[key] = val
            .replace(/<[^>]*>/g, '') // Strip HTML tags
            .replace(/\s+/g, ' ')    // Normalize whitespace
            .trim()
            .substring(0, 500);      // Truncate long values
        } else {
          cleaned[key] = val;
        }
      }
      return cleaned;
    }
  );

  const sampleRowsJson = JSON.stringify(sanitizedSamples, null, 2);

  return `You are a precise data classification and column mapping AI. Your task is to examine CSV headers and sample data, then determine the dataset type and map each column to a CRM schema field.

=== TARGET CRM FIELDS ===

Each CSV column should be mapped to ONE of these CRM fields. Use empty string "" if a column has no CRM equivalent.

1. email — Email address (primary identifier)
2. name — Full name (combine first_name + last_name if split)
3. mobile_without_country_code — Phone number digits only (no formatting, no country code)
4. country_code — International dialing code without "+" (e.g. "1", "44", "91")
5. company — Organization or business name
6. city — City or town name
7. state — State, province, or region
8. country — Country name
9. lead_owner — Person responsible for the lead
10. crm_status — Pipeline stage (new, contacted, qualified, proposal, negotiation, closed_won, closed_lost, follow_up)
11. crm_note — Notes, extra emails/phones, or data that doesn't fit elsewhere
12. created_at — Date/time (will be converted to ISO 8601 on the backend)
13. possession_time — Free-text time/date info
14. description — Free-text description or notes

=== COLUMN MAPPING RULES ===

Map each CSV header to the most appropriate CRM field:

email:
  → email, e-mail, email_address, mail, emailid, email_id, e_mail, "Email Address"

mobile_without_country_code:
  → phone, mobile, phone_number, cell, telephone, tel, contact_no, "Phone Number"

name:
  → full_name, firstname, lastname, fullname, contact_name, customer_name, applicant, person_name
  → If split across first_name & last_name, BOTH map to "name" (backend will combine them)

company:
  → company, organization, company_name, firm, business, employer, org

country_code:
  → country_code, dial_code, code (when it clearly refers to phone code)

city → city, town, municipality, location_city
state → state, province, region, county
country → country, nation, country_name, nationality
lead_owner → owner, assigned_to, sales_rep, account_manager, lead_owner
crm_status → status, lead_status, crm_status
created_at → date, created, created_date, timestamp, registration_date, signup_date
description → description, notes, comments, note, additional_info
possession_time → possession_time, possession

Columns that don't match any CRM field → map to ""

=== DATASET CLASSIFICATION ===

Analyze ALL headers and sample data to determine the dataset type:

- "CRM Leads" — Contact data: emails, names, phones, companies. Clearly people/leads.
- "Customer Database" — Customer records with accounts, membership, customer IDs.
- "Shopping Dataset" — Products, prices, quantities, orders, categories, SKUs.
- "Financial Dataset" — Transactions, amounts, payments, invoices, taxes, balances.
- "Student Dataset" — Students, grades, courses, classes, subjects, enrollments.
- "Employee Dataset" — Employees, salaries, departments, positions, hire dates.
- "Unknown" — Cannot determine with high confidence.

Confidence scoring:
- 90-100: Headers clearly match one type with strong signal
- 80-89: Good match, some ambiguity
- 70-79: Possible match, mixed signals
- Below 70: Uncertain — use "Unknown"

If the dataset is NOT CRM-related (Shopping, Financial, Student, Employee) with confidence ≥ 80%, the system will reject the import. Only map CRM-like data.

=== STRICT RULES ===

1. Return ONLY valid JSON. No markdown, no code fences, no explanations.
2. Every CSV header MUST have an entry in the mapping object (either a CRM field name or "").
3. Do NOT make up data or hallucinate mappings.
4. If a column's purpose is unclear, map it to "".
5. The confidence reflects how sure you are that the dataset is CRM-compatible.
6. datasetType must be one of the 7 defined types.

=== OUTPUT FORMAT ===

{
  "mapping": {
    "CSV Header 1": "email",
    "CSV Header 2": "name",
    "CSV Header 3": ""
  },
  "datasetType": "CRM Leads",
  "confidence": 95
}

=== INPUT DATA ===

CSV Headers: [${sanitizedHeaders.join(', ')}]

Sample Rows (first ${sanitizedSamples.length} rows for context):
${sampleRowsJson}

Remember: ONLY return the JSON mapping. Never process individual records.`;
};
