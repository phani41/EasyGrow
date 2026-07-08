import { GoogleGenAI } from '@google/genai';
import type { GenerateContentConfig } from '@google/genai';
import { CsvRow, ColumnMapping, DatasetType } from '../types';
import { buildColumnMappingPrompt } from '../prompts/crm.prompt';
import { sleep, withTimeout, isTimeoutError } from '../utils/helpers';

// ===== Constants =====

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10000;
const GEMINI_TIMEOUT_MS = 60_000; // 1 minute for mapping (small prompt)

// ===== Response Types =====

export interface GeminiMappingResult {
  mapping: ColumnMapping;
  datasetType: DatasetType;
  confidence: number;
  tokenUsage: TokenUsage;
}

interface TokenUsage {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

interface AiMappingResponse {
  mapping: ColumnMapping;
  datasetType: DatasetType;
  confidence: number;
}

// ===== Error Types =====

export class GeminiApiError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(message: string, code: string, retryable: boolean = false) {
    super(message);
    this.name = 'GeminiApiError';
    this.code = code;
    this.retryable = retryable;
  }
}

// ===== Safety Settings =====

const safetySettings: GenerateContentConfig['safetySettings'] = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

// ===== Service =====

export class GeminiService {
  private ai: GoogleGenAI;
  private modelName: string;
  private mockMode: boolean;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.mockMode = process.env.GEMINI_MOCK_MODE === 'true';
    this.modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;

    if (!this.mockMode) {
      if (!apiKey) {
        throw new Error(
          'GEMINI_API_KEY is required. Set it in your .env file, or set GEMINI_MOCK_MODE=true for development without an API key.'
        );
      }

      if (!apiKey.startsWith('AIza')) {
        console.warn(
          '[GeminiService] GEMINI_API_KEY format looks unusual. ' +
          'Google API keys typically start with "AIza". ' +
          'Get a key at https://aistudio.google.com/apikey'
        );
      }
    }

    this.ai = new GoogleGenAI({ apiKey: apiKey || 'mock-key' });

    console.log(
      this.mockMode
        ? '[GeminiService] Running in MOCK mode — no API calls will be made.'
        : `[GeminiService] Initialized with model: ${this.modelName}`
    );
  }

  /**
   * Validate the API key by making a lightweight API call.
   */
  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    if (this.mockMode) {
      return { valid: true };
    }

    try {
      await withTimeout(
        this.ai.models.generateContent({
          model: this.modelName,
          contents: [{ role: 'user', parts: [{ text: 'Respond with just: OK' }] }],
          config: {
            maxOutputTokens: 10,
            temperature: 0,
          },
        }),
        10_000,
        'API key validation timed out'
      );
      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('API_KEY_INVALID') || message.includes('API key not valid')) {
        return {
          valid: false,
          error: 'Your GEMINI_API_KEY is invalid. Please generate a new API key at https://aistudio.google.com/apikey',
        };
      }

      if (message.includes('API_KEY_SERVICE_DISABLED') || message.includes('API key not found')) {
        return {
          valid: false,
          error: 'The API key exists but does not have Generative Language API enabled. Enable it in Google Cloud Console.',
        };
      }

      if (message.includes('PERMISSION_DENIED')) {
        return {
          valid: false,
          error: 'API key does not have permission. Ensure Generative Language API is enabled for your project.',
        };
      }

      console.warn(`[GeminiService] API key validation warning: ${message}`);
      return { valid: true, error: `API key validation warning: ${message}` };
    }
  }

  /**
   * Get column mapping from Gemini by sending headers + up to 5 sample rows.
   * This is a SINGLE AI call — never repeated per batch.
   */
  async getColumnMapping(
    headers: string[],
    sampleRows: CsvRow[],
  ): Promise<GeminiMappingResult> {
    if (this.mockMode) {
      return this.mockMapping(headers, sampleRows);
    }

    let lastError: Error | null = null;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.callGeminiApi(headers, sampleRows, attempt);

        const elapsed = Date.now() - startTime;
        console.log(
          `[GeminiService] Column mapping completed in ${(elapsed / 1000).toFixed(1)}s (attempts: ${attempt})`
        );

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        const isGeminiApiError = error instanceof GeminiApiError && error.retryable;
        const isTimeout = isTimeoutError(error);
        const isServerError =
          isTimeout ||
          isGeminiApiError ||
          lastError.message.includes('503') ||
          lastError.message.includes('500') ||
          lastError.message.includes('429') ||
          lastError.message.includes('quota') ||
          lastError.message.includes('rate') ||
          lastError.message.includes('timeout') ||
          lastError.message.includes('RESOURCE_EXHAUSTED') ||
          lastError.message.includes('UNAVAILABLE') ||
          lastError.message.includes('INTERNAL') ||
          lastError.message.includes('json') ||
          lastError.message.includes('parse');

        if (!isServerError) {
          throw new GeminiApiError(
            `Column mapping failed: ${lastError.message}`,
            'AI_MAPPING_ERROR',
            false
          );
        }

        if (attempt < MAX_RETRIES) {
          const delay = Math.min(
            BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 1000,
            MAX_RETRY_DELAY_MS
          );
          console.warn(
            `[GeminiService] Column mapping attempt ${attempt} failed. ` +
            `Retrying in ${delay}ms... Error: ${lastError.message}`
          );
          await sleep(delay);
        }
      }
    }

    throw new GeminiApiError(
      `Column mapping failed after ${MAX_RETRIES} attempts: ${lastError?.message}`,
      'MAX_RETRIES_EXCEEDED',
      false
    );
  }

  /**
   * Core Gemini API call for column mapping.
   * Sends ONLY headers + up to 5 sample rows — never the full dataset.
   */
  private async callGeminiApi(
    headers: string[],
    sampleRows: CsvRow[],
    attempt: number
  ): Promise<GeminiMappingResult> {
    const samples = sampleRows.slice(0, 5);
    const prompt = buildColumnMappingPrompt(headers, samples);

    console.log(
      `[GeminiService] Column mapping: ` +
      `model=${this.modelName}, ` +
      `headers=${headers.length}, ` +
      `samples=${samples.length}, ` +
      `attempt=${attempt}`
    );

    const generationConfig: GenerateContentConfig = {
      safetySettings,
      temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.2'),
      maxOutputTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '4096', 10),
      topP: 0.95,
      topK: 40,
      responseMimeType: 'application/json',
    };

    const result = await withTimeout(
      this.ai.models.generateContent({
        model: this.modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: generationConfig,
      }),
      GEMINI_TIMEOUT_MS,
      `Gemini API timed out after ${GEMINI_TIMEOUT_MS / 1000}s for column mapping`
    );

    const text = result.text;
    if (!text) {
      throw new GeminiApiError(
        'Empty response from Gemini for column mapping. The model may have blocked the response.',
        'EMPTY_RESPONSE',
        true
      );
    }

    const usageMetadata = result.usageMetadata;
    const tokenUsage: TokenUsage = {
      totalTokens: usageMetadata?.totalTokenCount ?? 0,
      promptTokens: usageMetadata?.promptTokenCount ?? 0,
      completionTokens: usageMetadata?.candidatesTokenCount ?? 0,
    };

    console.log(
      `[GeminiService] Column mapping tokens: ` +
      `Prompt=${tokenUsage.promptTokens}, ` +
      `Completion=${tokenUsage.completionTokens}, ` +
      `Total=${tokenUsage.totalTokens}`
    );

    const parsed = this.parseMappingResponse(text);
    this.validateMapping(parsed, headers);

    return { ...parsed, tokenUsage };
  }

  /**
   * Parse the mapping response from Gemini.
   */
  private parseMappingResponse(text: string): AiMappingResponse {
    let cleanJson = text.trim();

    const jsonBlockMatch = cleanJson.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      cleanJson = jsonBlockMatch[1].trim();
    }

    let parsed: AiMappingResponse;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          throw new GeminiApiError(
            'Failed to parse Gemini response as JSON for column mapping. ' +
            'Response preview: ' + cleanJson.substring(0, 200),
            'PARSE_ERROR',
            true
          );
        }
      } else {
        throw new GeminiApiError(
          'Failed to parse Gemini response as JSON for column mapping. ' +
          'No JSON object found. Response preview: ' + cleanJson.substring(0, 200),
          'PARSE_ERROR',
          true
        );
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new GeminiApiError(
        'Invalid response from Gemini: response is not an object',
        'INVALID_RESPONSE',
        true
      );
    }

    if (!parsed.mapping || typeof parsed.mapping !== 'object') {
      throw new GeminiApiError(
        'Invalid response: "mapping" field is missing or not an object',
        'INVALID_RESPONSE_STRUCTURE',
        true
      );
    }

    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 100) {
      parsed.confidence = 50;
    }

    if (!parsed.datasetType || typeof parsed.datasetType !== 'string') {
      parsed.datasetType = 'Unknown' as DatasetType;
    }

    return parsed;
  }

  /**
   * Validate that all headers have a mapping entry and all values are valid.
   */
  private validateMapping(parsed: AiMappingResponse, originalHeaders: string[]): void {
    const validCrmFields = new Set([
      'email', 'name', 'mobile_without_country_code', 'country_code',
      'company', 'city', 'state', 'country', 'lead_owner',
      'crm_status', 'crm_note', 'created_at', 'possession_time', 'description', '',
    ]);

    for (const header of originalHeaders) {
      if (!(header in parsed.mapping)) {
        console.warn(`[GeminiService] Header "${header}" was not included in mapping — treating as unmapped`);
        parsed.mapping[header] = '';
      }
    }

    for (const [header, value] of Object.entries(parsed.mapping)) {
      if (!validCrmFields.has(value)) {
        console.warn(`[GeminiService] Header "${header}" mapped to unknown field "${value}" — resetting to ""`);
        parsed.mapping[header] = '';
      }
    }
  }

  // ===== Mock Mode =====

  private async mockMapping(
    headers: string[],
    sampleRows: CsvRow[]
  ): Promise<GeminiMappingResult> {
    console.log(`[GeminiService] Mock mode: generating column mapping for ${headers.length} headers`);

    await sleep(500);

    const mapping: ColumnMapping = {};
    for (const header of headers) {
      const lower = header.toLowerCase().trim();
      if (/email|e-?mail|mail/.test(lower)) mapping[header] = 'email';
      else if (/phone|mobile|cell|telephone|contact/.test(lower)) mapping[header] = 'mobile_without_country_code';
      else if (/name|full.?name|customer|applicant/.test(lower)) mapping[header] = 'name';
      else if (/company|organization|firm|business/.test(lower)) mapping[header] = 'company';
      else if (/city|town/.test(lower)) mapping[header] = 'city';
      else if (/state|province|region/.test(lower)) mapping[header] = 'state';
      else if (/country|nation/.test(lower)) mapping[header] = 'country';
      else if (/country_code|dial_code/.test(lower)) mapping[header] = 'country_code';
      else if (/owner|assigned|sales.?rep/.test(lower)) mapping[header] = 'lead_owner';
      else if (/status/.test(lower)) mapping[header] = 'crm_status';
      else if (/date|created|timestamp/.test(lower)) mapping[header] = 'created_at';
      else if (/description|notes?|comments?/.test(lower)) mapping[header] = 'description';
      else if (/possession/.test(lower)) mapping[header] = 'possession_time';
      else mapping[header] = '';
    }

    const crmHeaders = Object.values(mapping).filter(v => v !== '');
    const confidence = Math.round((crmHeaders.length / Math.max(headers.length, 1)) * 70 + 25);
    const hasEmail = Object.values(mapping).includes('email');
    const hasPhone = Object.values(mapping).includes('mobile_without_country_code');
    const datasetType: DatasetType = (hasEmail || hasPhone) ? 'CRM Leads' : 'Unknown';

    return {
      mapping,
      datasetType,
      confidence: Math.min(confidence, 98),
      tokenUsage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 },
    };
  }
}
