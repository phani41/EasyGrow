import { sanitizeForPrompt } from '../utils/helpers';

/**
 * Build a prompt that asks the AI to classify the dataset and return a column mapping
 * (CSV headers → CRM fields). The AI should NEVER process individual records.
 *
 * Input: CSV headers + up to 5 sample rows
 * Output: { mapping: { "CSV Header": "crm_field" }, datasetType: "confidence": 0-100, reason: "string" }
 */
export const buildColumnMappingPrompt = (
  headers: string[],
  sampleRows: Record<string, string | undefined>[]
): string => {
  const sanitizedHeaders = headers.map((h) =>
    typeof h === 'string' ? h.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') : h
  );

  const sanitizedSamples = sanitizeForPrompt(sampleRows.slice(0, 5)).map(
    (row: Record<string, string | undefined>) => {
      const cleaned: Record<string, string | undefined> = {};
      for (const [key, val] of Object.entries(row)) {
        if (typeof val === 'string') {
          cleaned[key] = val
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 500);
        } else {
          cleaned[key] = val;
        }
      }
      return cleaned;
    }
  );

  const sampleRowsJson = JSON.stringify(sanitizedSamples, null, 2);

  return `You are a precise data classification and column mapping AI. Your ONLY task is to return a JSON object mapping CSV column headers to CRM schema fields and classify the dataset type.

=== CRITICAL RULES ===
1. Return ONLY valid JSON. No markdown, no code fences (no \`\`\`), no explanations, no extra text.
2. Every CSV header MUST have exactly one entry in the "mapping" object.
3. If a column's purpose is unclear, map it to "" (empty string).
4. Do NOT hallucinate mappings. Only map if you are confident.
5. Do NOT make up data values. Only analyze headers and sample rows.
6. If there are multiple email columns (e.g. "Email", "Alternate Email", "Secondary Email"), map all to "email" — the backend handles deduplication.
7. If there are multiple phone columns (e.g. "Phone", "Mobile", "Work Phone"), map all to "mobile_without_country_code" — the backend handles deduplication.
8. For first_name + last_name split columns, map BOTH to "name".
9. Notes, comments, or extra unstructured data → map to "crm_note".
10. datasetType must be one of the EXACT types listed below.
11. confidence must be an integer 0-100 reflecting your certainty.

=== TARGET CRM FIELDS ===

Map each CSV column to ONE of these CRM fields. Use empty string "" if a column has no CRM equivalent.

1. email — Email address (primary identifier). Map ALL email-related columns here.
2. name — Full name. Map first_name AND last_name both to "name" (backend combines them).
3. mobile_without_country_code — Phone number digits only (no formatting, no country code).
4. country_code — International dialing code without "+" (e.g. "1", "44", "91").
5. company — Organization or business name.
6. city — City or town name.
7. state — State, province, or region.
8. country — Country name.
9. lead_owner — Person responsible for the lead.
10. crm_status — Lead status. Common input values: new, contacted, qualified, proposal, negotiation, closed_won, closed_lost, follow_up, interested, not interested.
11. crm_note — Notes, extra emails/phones, comments, or data that doesn't fit elsewhere.
12. created_at — Date/time column (any format — backend normalizes to ISO 8601).
13. possession_time — Free-text time/date info, tenure, occupancy period.
14. description — Free-text description or notes.

=== COMMON COLUMN MAPPING PATTERNS ===

email → email, e-mail, email_address, email_id, mail, emailid, e_mail, email_addr, primary_email, alternate_email, secondary_email, cc, to, from
mobile_without_country_code → phone, mobile, phone_number, cell, telephone, tel, contact_no, contact_number, work_phone, home_phone, mobile_phone, alternate_phone, toll_free
name → full_name, first_name, last_name, firstname, lastname, fullname, contact_name, customer_name, applicant, person_name, given_name, family_name, surname, name
company → company, organization, company_name, firm, business, employer, org, account, account_name, client, vendor
country_code → country_code, dial_code, phone_code, area_code, calling_code, isd_code
city → city, town, municipality, locality, city_name, district, suburb
state → state, province, region, county, state_region, prefecture
country → country, nation, country_name, nationality, sovereign_state
lead_owner → lead_owner, owner, assigned_to, sales_rep, account_manager, agent, assignee, managed_by
crm_status → status, lead_status, crm_status, pipeline_stage, deal_stage, stage, opportunity_stage
created_at → created_at, created, date, created_date, timestamp, registration_date, signup_date, entry_date, submission_date, created_on, added_on
description → description, notes, note, comments, remark, details, summary, feedback, observations
possession_time → possession_time, possession, tenure, ownership_period, occupancy
crm_note → crm_note, note, notes, comments, remarks, feedback (for unstructured text)

=== DATASET CLASSIFICATION ===

Analyze ALL headers and sample data to determine the dataset type. Choose EXACTLY ONE:

- "CRM Leads" — Contact data: emails, names, phones, companies, statuses, owners. Clearly people/leads.
- "Customer Database" — Customer records with accounts, membership, customer IDs, subscriptions.
- "Shopping Dataset" — Products, prices, quantities, orders, categories, SKUs, items, totals, shipping.
- "Financial Dataset" — Transactions, amounts, payments, invoices, taxes, balances, debits, credits, loans.
- "Student Dataset" — Students, grades, courses, classes, subjects, enrollments, exams, scores, admissions.
- "Employee Dataset" — Employees, salaries, departments, positions, hire dates, payroll, designations.
- "Property Dataset" — Properties, plots, sqft, area, land, buildings, apartments, floors, bedrooms, amenities, possession.
- "Marketing Dataset" — Campaigns, sources, mediums, channels, clicks, impressions, conversions, ads, traffic, UTM.
- "Unknown" — Cannot determine with high confidence.

Confidence scoring:
- 90-100: Headers clearly match one type with strong signal
- 80-89: Good match, some ambiguity
- 70-79: Possible match, mixed signals
- Below 70: Uncertain — use "Unknown"

=== OUTPUT FORMAT ===

{
  "mapping": {
    "CSV Header 1": "email",
    "CSV Header 2": "name",
    "CSV Header 3": "",
    "CSV Header 4": "mobile_without_country_code"
  },
  "datasetType": "CRM Leads",
  "confidence": 95,
  "reason": "Found email, phone, and name columns indicating CRM lead data"
}

=== INPUT DATA ===

CSV Headers: [${sanitizedHeaders.join(', ')}]

Sample Rows (first ${sanitizedSamples.length} rows for context):
${sampleRowsJson}

Remember: ONLY return the JSON object. No markdown, no code fences, no extra text.`;
};
