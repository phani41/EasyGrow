import OpenAI from 'openai';
import { CsvRow, ColumnMapping, DatasetType } from '../types';
import { buildColumnMappingPrompt } from '../prompts/crm.prompt';
import { sleep, withTimeout, isTimeoutError } from '../utils/helpers';

// ===== Constants =====

const DEFAULT_MODEL = 'openrouter/auto';
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;
const OPENROUTER_TIMEOUT_MS = 60_000; // 1 minute for mapping (small prompt)
const TOKENS_PER_CHAR_ESTIMATE = 0.25;

// ===== Response Types =====

export interface OpenRouterMappingResult {
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

export class OpenRouterApiError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(message: string, code: string, retryable: boolean = false) {
    super(message);
    this.name = 'OpenRouterApiError';
    this.code = code;
    this.retryable = retryable;
  }
}

// ===== Service =====

export class OpenRouterService {
  private client: OpenAI | null;
  private modelName: string;
  private mockMode: boolean;
  private referer: string;
  private appName: string;
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.mockMode = process.env.OPENROUTER_MOCK_MODE === 'true';
    this.modelName = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
    this.referer = process.env.OPENROUTER_REFERER || 'http://localhost:3000';
    this.appName = process.env.OPENROUTER_APP_NAME || 'EasyGrow';

    if (this.mockMode) {
      this.client = null;
      return;
    }

    if (!this.apiKey) {
      this.client = null;
      console.warn(
        '[OpenRouterService] OPENROUTER_API_KEY not set — will fail on first API call. ' +
        'Set OPENROUTER_MOCK_MODE=true to run without an API key.'
      );
      return;
    }

    if (!this.apiKey.startsWith('sk-or-v1-')) {
      console.warn(
        '[OpenRouterService] OPENROUTER_API_KEY format looks unusual. ' +
        'OpenRouter API keys typically start with "sk-or-v1-". ' +
        'Get a key at https://openrouter.ai/keys'
      );
    }

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': this.referer,
        'X-Title': this.appName,
      },
    });

    console.log(`[OpenRouterService] Initialized with model: ${this.modelName}`);
  }

  /**
   * Returns the current configuration for debug logging.
   */
  getConfig(): { apiKeyLoaded: boolean; apiKeyPreview: string; model: string; mockMode: boolean; referer: string; appName: string } {
    return {
      apiKeyLoaded: !!this.apiKey,
      apiKeyPreview: this.apiKey ? this.apiKey.substring(0, 9) + '********' : 'N/A',
      model: this.modelName,
      mockMode: this.mockMode,
      referer: this.referer,
      appName: this.appName,
    };
  }

  /**
   * Ensure the OpenAI client is initialized before making API calls.
   */
  private ensureClient(): OpenAI {
    if (this.client) {
      return this.client;
    }

    if (this.mockMode) {
      throw new OpenRouterApiError(
        'OpenRouter is in mock mode — no API calls are available.',
        'MOCK_MODE',
        false
      );
    }

    if (!this.apiKey) {
      throw new OpenRouterApiError(
        'OPENROUTER_API_KEY is not configured. Set it in backend/.env or set OPENROUTER_MOCK_MODE=true.',
        'MISSING_API_KEY',
        false
      );
    }

    throw new OpenRouterApiError(
      'OpenRouter client is not initialized. This is a configuration error.',
      'CLIENT_NOT_INITIALIZED',
      false
    );
  }

  private extractStatusCode(error: unknown): number | null {
    if (error && typeof error === 'object') {
      if ('status' in error && typeof (error as any).status === 'number') {
        return (error as any).status;
      }
    }
    return null;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length * TOKENS_PER_CHAR_ESTIMATE);
  }

  /**
   * Try to repair malformed JSON from AI responses.
   */
  private tryJsonRepair(text: string): string | null {
    try {
      JSON.parse(text);
      return text;
    } catch {
      // Continue to repair attempts
    }

    let cleaned = text.trim();

    // Try 2: Strip markdown code fences
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        JSON.parse(codeBlockMatch[1].trim());
        return codeBlockMatch[1].trim();
      } catch {
        cleaned = codeBlockMatch[1].trim();
      }
    }

    // Try 3: Extract the first JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        JSON.parse(jsonMatch[0]);
        return jsonMatch[0];
      } catch {
        cleaned = jsonMatch[0];
      }
    }

    // Try 4: Fix common issues
    let fixed = cleaned
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/(?<!\\)'/g, '"')
      .replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    try {
      JSON.parse(fixed);
      return fixed;
    } catch {
      // Give up
    }

    return null;
  }

  /**
   * Get column mapping from AI by sending headers + up to 5 sample rows.
   * This is a SINGLE AI call — never repeated per batch.
   */
  async getColumnMapping(
    headers: string[],
    sampleRows: CsvRow[],
  ): Promise<OpenRouterMappingResult> {
    if (this.mockMode) {
      return this.mockMapping(headers, sampleRows);
    }

    let lastError: Error | null = null;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.callOpenRouterApi(headers, sampleRows, attempt);

        const elapsed = Date.now() - startTime;
        console.log(
          `[OpenRouterService] Column mapping completed in ${(elapsed / 1000).toFixed(1)}s (attempts: ${attempt})`
        );

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        const isRetryable = this.isRetryableError(error);

        if (!isRetryable) {
          throw new OpenRouterApiError(
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
            `[OpenRouterService] Column mapping attempt ${attempt} failed. ` +
            `Retrying in ${delay}ms... Error: ${lastError.message}`
          );
          await sleep(delay);
        }
      }
    }

    throw new OpenRouterApiError(
      `Column mapping failed after ${MAX_RETRIES} attempts: ${lastError?.message}`,
      'MAX_RETRIES_EXCEEDED',
      false
    );
  }

  /**
   * Determine if an error is retryable.
   */
  private isRetryableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const isTimeout = isTimeoutError(error);
    const isApiError = error instanceof OpenRouterApiError && error.retryable;

    return (
      isTimeout ||
      isApiError ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('500') ||
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('internal server error') ||
      message.includes('service unavailable') ||
      message.includes('bad gateway') ||
      message.includes('temporarily unavailable') ||
      message.includes('too many requests') ||
      message.includes('insufficient_quota') ||
      message.includes('json') ||
      message.includes('parse')
    );
  }

  /**
   * Convert API HTTP status codes to friendly, user-facing error messages.
   * Called when the first real API request returns a non-retryable error.
   */
  private toFriendlyApiError(error: unknown): OpenRouterApiError | null {
    const statusCode = this.extractStatusCode(error);
    const message = error instanceof Error ? error.message.toLowerCase() : '';

    if (statusCode === 401 || message.includes('401') || message.includes('unauthorized') || message.includes('invalid api key')) {
      return new OpenRouterApiError(
        'Invalid API key. Please verify your OPENROUTER_API_KEY is correct and has not expired. Get a new key at https://openrouter.ai/keys',
        'INVALID_API_KEY',
        false
      );
    }

    if (statusCode === 402 || message.includes('402') || message.includes('insufficient_quota') || message.includes('insufficient credits')) {
      return new OpenRouterApiError(
        'Insufficient credits. Your OpenRouter account has run out of credits. Add funds at https://openrouter.ai',
        'INSUFFICIENT_CREDITS',
        false
      );
    }

    if (statusCode === 404 || message.includes('404') || message.includes('model not found')) {
      return new OpenRouterApiError(
        `Model "${this.modelName}" not found on OpenRouter. Check your OPENROUTER_MODEL setting or use "openrouter/auto".`,
        'MODEL_NOT_FOUND',
        false
      );
    }

    if (statusCode === 429 || message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
      return new OpenRouterApiError(
        'Rate limit exceeded. OpenRouter is temporarily throttling requests. Please wait a moment and try again.',
        'RATE_LIMITED',
        true // Retryable — transient rate limit
      );
    }

    if (statusCode === 503 || statusCode === 502 || statusCode === 500 ||
        message.includes('503') || message.includes('502') || message.includes('500') ||
        message.includes('service unavailable') || message.includes('bad gateway') || message.includes('internal server error')) {
      return new OpenRouterApiError(
        'OpenRouter service is temporarily unavailable. Please try again in a few minutes.',
        'SERVICE_UNAVAILABLE',
        true // Retryable — transient server error
      );
    }

    return null; // No specific friendly message — use default handling
  }

  /**
   * Core OpenRouter API call for column mapping.
   * Sends ONLY headers + up to 5 sample rows — never the full dataset.
   */
  private async callOpenRouterApi(
    headers: string[],
    sampleRows: CsvRow[],
    attempt: number
  ): Promise<OpenRouterMappingResult> {
    const samples = sampleRows.slice(0, 5);
    const prompt = buildColumnMappingPrompt(headers, samples);

    const estimatedTokens = this.estimateTokens(prompt);
    console.log(
      `[OpenRouterService] Column mapping: ` +
      `model=${this.modelName}, ` +
      `headers=${headers.length}, ` +
      `samples=${samples.length}, ` +
      `estimated=${estimatedTokens} tokens, ` +
      `attempt=${attempt}`
    );

    const client = this.ensureClient();

    let result;
    try {
      result = await withTimeout(
        client.chat.completions.create({
          model: this.modelName,
          messages: [
            {
              role: 'system',
              content:
                'You are a precise data classification and column mapping AI. ' +
                'You ALWAYS respond with valid JSON only. ' +
                'Never include markdown code fences, explanations, or any text outside the JSON object.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: parseFloat(process.env.OPENROUTER_TEMPERATURE || '0.2'),
          max_tokens: parseInt(process.env.OPENROUTER_MAX_TOKENS || '4096', 10),
          top_p: 0.95,
          response_format: { type: 'json_object' },
        }),
        OPENROUTER_TIMEOUT_MS,
        `OpenRouter API timed out after ${OPENROUTER_TIMEOUT_MS / 1000}s for column mapping`
      );
    } catch (error) {
      // Convert HTTP status codes to friendly error messages
      const friendlyError = this.toFriendlyApiError(error);
      if (friendlyError) {
        throw friendlyError;
      }
      // Re-throw non-API errors (timeouts, network errors) as-is
      throw error;
    }

    const content = result.choices?.[0]?.message?.content;
    if (!content) {
      const finishReason = result.choices?.[0]?.finish_reason;
      throw new OpenRouterApiError(
        `Empty response from OpenRouter for column mapping. Finish reason: ${finishReason || 'unknown'}.`,
        'EMPTY_RESPONSE',
        true
      );
    }

    const usage = result.usage;
    const tokenUsage: TokenUsage = {
      totalTokens: usage?.total_tokens ?? estimatedTokens,
      promptTokens: usage?.prompt_tokens ?? estimatedTokens,
      completionTokens: usage?.completion_tokens ?? 0,
    };

    console.log(
      `[OpenRouterService] Column mapping tokens: ` +
      `Prompt=${tokenUsage.promptTokens}, ` +
      `Completion=${tokenUsage.completionTokens}, ` +
      `Total=${tokenUsage.totalTokens}`
    );

    // Parse the JSON response
    const parsed = this.parseMappingResponse(content);
    this.validateMapping(parsed, headers);

    return { ...parsed, tokenUsage };
  }

  /**
   * Parse the mapping response from OpenRouter.
   */
  private parseMappingResponse(text: string): AiMappingResponse {
    const repaired = this.tryJsonRepair(text);

    if (!repaired) {
      console.warn(
        `[OpenRouterService] Raw response (${text.length} chars):`,
        text.substring(0, 500)
      );
      throw new OpenRouterApiError(
        'Failed to parse OpenRouter response as JSON. The AI response was not valid JSON.',
        'PARSE_ERROR',
        true
      );
    }

    let parsed: AiMappingResponse;
    try {
      parsed = JSON.parse(repaired);
    } catch {
      console.warn(
        `[OpenRouterService] Raw response (${text.length} chars):`,
        text.substring(0, 500)
      );
      throw new OpenRouterApiError(
        'Failed to parse OpenRouter response as JSON.',
        'PARSE_ERROR',
        true
      );
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new OpenRouterApiError(
        'Invalid response from OpenRouter: response is not an object',
        'INVALID_RESPONSE',
        true
      );
    }

    if (!parsed.mapping || typeof parsed.mapping !== 'object') {
      throw new OpenRouterApiError(
        'Invalid response: "mapping" field is missing or not an object',
        'INVALID_RESPONSE_STRUCTURE',
        true
      );
    }

    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 100) {
      parsed.confidence = 50; // Default if missing/invalid
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

    // Warn about unmapped headers
    for (const header of originalHeaders) {
      if (!(header in parsed.mapping)) {
        console.warn(
          `[OpenRouterService] Header "${header}" was not included in mapping — treating as unmapped`
        );
        parsed.mapping[header] = '';
      }
    }

    // Validate mapping values
    for (const [header, value] of Object.entries(parsed.mapping)) {
      if (!validCrmFields.has(value)) {
        console.warn(
          `[OpenRouterService] Header "${header}" mapped to unknown field "${value}" — resetting to ""`
        );
        parsed.mapping[header] = '';
      }
    }
  }

  // ===== Mock Mode =====

  private async mockMapping(
    headers: string[],
    sampleRows: CsvRow[]
  ): Promise<OpenRouterMappingResult> {
    console.log(`[OpenRouterService] Mock mode: generating column mapping for ${headers.length} headers`);

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
