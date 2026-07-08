import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiService, GeminiApiError } from '../services/gemini.service';
import { CsvRow } from '../types';

// ===== Mocks =====

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
}));

// ===== Helpers =====

const SAMPLE_HEADERS = ['Full Name', 'Email', 'Phone', 'Company'];
const SAMPLE_ROWS: CsvRow[] = [
  { 'Full Name': 'Alice', 'Email': 'alice@test.com', 'Phone': '555-0101', 'Company': 'Acme' },
  { 'Full Name': 'Bob', 'Email': 'bob@test.com', 'Phone': '555-0102', 'Company': 'Beta' },
];

const VALID_MAPPING_RESPONSE = {
  text: JSON.stringify({
    mapping: {
      'Full Name': 'name',
      'Email': 'email',
      'Phone': 'mobile_without_country_code',
      'Company': 'company',
    },
    datasetType: 'CRM Leads',
    confidence: 95,
  }),
  usageMetadata: {
    totalTokenCount: 110,
    promptTokenCount: 80,
    candidatesTokenCount: 30,
  },
};

function setupEnv(mockMode: boolean = false) {
  process.env.GEMINI_API_KEY = mockMode ? '' : 'test-key';
  process.env.GEMINI_MOCK_MODE = mockMode ? 'true' : 'false';
  process.env.GEMINI_MODEL = 'gemini-1.5-flash';
  process.env.GEMINI_TEMPERATURE = '0.2';
  process.env.GEMINI_MAX_TOKENS = '4096';
}

// ===== Tests =====

describe('GeminiService - Mock Mode', () => {
  beforeEach(() => {
    setupEnv(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MOCK_MODE;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_TEMPERATURE;
    delete process.env.GEMINI_MAX_TOKENS;
  });

  it('should return mapping with correct shape in mock mode', async () => {
    const service = new GeminiService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.mapping).toBeDefined();
    expect(typeof result.mapping).toBe('object');
    expect(result.datasetType).toBeDefined();
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage.totalTokens).toBe(0);
  });

  it('should detect email field from headers in mock mode', async () => {
    const service = new GeminiService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.mapping['Email']).toBe('email');
    expect(result.mapping['Phone']).toBe('mobile_without_country_code');
  });

  it('should detect dataset type as CRM Leads when email/phone present', async () => {
    const service = new GeminiService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.datasetType).toBe('CRM Leads');
  });
});

describe('GeminiService - Retry Logic', () => {
  beforeEach(() => {
    setupEnv(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MOCK_MODE;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_TEMPERATURE;
    delete process.env.GEMINI_MAX_TOKENS;
  });

  it('should succeed on first attempt when API responds correctly', async () => {
    mockGenerateContent.mockResolvedValue(VALID_MAPPING_RESPONSE);

    const service = new GeminiService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.mapping['Full Name']).toBe('name');
    expect(result.mapping['Email']).toBe('email');
    expect(result.datasetType).toBe('CRM Leads');
    expect(result.confidence).toBe(95);
    expect(result.tokenUsage.totalTokens).toBe(110);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('should retry and succeed on transient 503 error', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockResolvedValueOnce(VALID_MAPPING_RESPONSE);

    const service = new GeminiService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.mapping['Full Name']).toBe('name');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('should retry and succeed on rate limit (429) error', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('429 Too Many Requests'))
      .mockResolvedValueOnce(VALID_MAPPING_RESPONSE);

    const service = new GeminiService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.mapping['Full Name']).toBe('name');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('should retry on RESOURCE_EXHAUSTED error', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('RESOURCE_EXHAUSTED'))
      .mockResolvedValueOnce(VALID_MAPPING_RESPONSE);

    const service = new GeminiService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.mapping['Full Name']).toBe('name');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('should throw MAX_RETRIES_EXCEEDED after exhausting all retries', async () => {
    mockGenerateContent.mockRejectedValue(new Error('503 Service Unavailable'));

    const service = new GeminiService();

    const error = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS).catch(e => e);

    expect(error).toBeInstanceOf(GeminiApiError);
    expect(error.code).toBe('MAX_RETRIES_EXCEEDED');
    expect(error.message).toContain('after 3 attempts');
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  });

  it('should throw immediately on 404 (model not found) without retrying', async () => {
    mockGenerateContent.mockRejectedValue(new Error('404 Model not found'));

    const service = new GeminiService();

    const error = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS).catch(e => e);

    expect(error).toBeInstanceOf(GeminiApiError);
    expect(error.message).toContain('Column mapping failed');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('should produce correct token usage metadata on success', async () => {
    mockGenerateContent.mockResolvedValue(VALID_MAPPING_RESPONSE);

    const service = new GeminiService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.tokenUsage.totalTokens).toBe(110);
    expect(result.tokenUsage.promptTokens).toBe(80);
    expect(result.tokenUsage.completionTokens).toBe(30);
  });

  it('should handle empty response gracefully', async () => {
    mockGenerateContent.mockResolvedValue({ text: '', usageMetadata: null });

    const service = new GeminiService();

    const error = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS).catch(e => e);

    expect(error).toBeInstanceOf(GeminiApiError);
    expect(error.code).toBe('EMPTY_RESPONSE');
  });
});

describe('GeminiService - Constructor', () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MOCK_MODE;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_TEMPERATURE;
    delete process.env.GEMINI_MAX_TOKENS;
  });

  it('should throw when no API key and not in mock mode', () => {
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_MOCK_MODE = 'false';

    expect(() => new GeminiService()).toThrow('GEMINI_API_KEY is required');
  });

  it('should not throw in mock mode without API key', () => {
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_MOCK_MODE = 'true';

    expect(() => new GeminiService()).not.toThrow();
  });
});
