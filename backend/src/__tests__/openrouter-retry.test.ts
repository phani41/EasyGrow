import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterService, OpenRouterApiError } from '../services/openrouter.service';
import { logger } from '../services/logger.service';
import { CsvRow } from '../types';

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('openai', () => {
  const MockOpenAI = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));

  return {
    default: MockOpenAI,
  };
});

const SAMPLE_HEADERS = ['Full Name', 'Email', 'Phone', 'Company'];
const SAMPLE_ROWS: CsvRow[] = [
  { 'Full Name': 'Alice', 'Email': 'alice@test.com', 'Phone': '555-0101', 'Company': 'Acme' },
  { 'Full Name': 'Bob', 'Email': 'bob@test.com', 'Phone': '555-0102', 'Company': 'Beta' },
  { 'Full Name': 'Charlie', 'Email': 'charlie@test.com', 'Phone': '555-0103', 'Company': 'Gamma' },
];

const VALID_MAPPING_RESPONSE = {
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: JSON.stringify({
          mapping: {
            'Full Name': 'name',
            'Email': 'email',
            'Phone': 'mobile_without_country_code',
            'Company': 'company',
          },
          datasetType: 'CRM Leads',
          confidence: 95,
        }),
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 80,
    completion_tokens: 30,
    total_tokens: 110,
  },
};

function setupEnv(mockMode: boolean = false) {
  process.env.OPENROUTER_API_KEY = mockMode ? '' : 'sk-or-test-key';
  process.env.OPENROUTER_MOCK_MODE = mockMode ? 'true' : 'false';
  process.env.OPENROUTER_MODEL = 'openrouter/auto';
  process.env.OPENROUTER_TEMPERATURE = '0.2';
  process.env.OPENROUTER_MAX_TOKENS = '4096';
  process.env.OPENROUTER_REFERER = 'http://localhost:3000';
  process.env.OPENROUTER_APP_NAME = 'EasyGrow';
}

describe('OpenRouterService - Mock Mode', () => {
  beforeEach(() => {
    setupEnv(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MOCK_MODE;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_TEMPERATURE;
    delete process.env.OPENROUTER_MAX_TOKENS;
    delete process.env.OPENROUTER_REFERER;
    delete process.env.OPENROUTER_APP_NAME;
  });

  it('should return mapping with correct shape in mock mode', async () => {
    const service = new OpenRouterService();
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
    const service = new OpenRouterService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.mapping['Email']).toBe('email');
    expect(result.mapping['Phone']).toBe('mobile_without_country_code');
  });

  it('should detect dataset type as CRM Leads when email/phone present', async () => {
    const service = new OpenRouterService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.datasetType).toBe('CRM Leads');
  });

  it('should handle unknown dataset type for non-CRM headers', async () => {
    const headers = ['Product', 'Price', 'Quantity', 'Category'];
    const rows: CsvRow[] = [{ 'Product': 'Widget', 'Price': '10', 'Quantity': '5', 'Category': 'A' }];

    const service = new OpenRouterService();
    const result = await service.getColumnMapping(headers, rows);

    expect(result.datasetType).toBe('Unknown');
  });
});

describe('OpenRouterService - Retry Logic', () => {
  beforeEach(() => {
    setupEnv(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MOCK_MODE;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_TEMPERATURE;
    delete process.env.OPENROUTER_MAX_TOKENS;
    delete process.env.OPENROUTER_REFERER;
    delete process.env.OPENROUTER_APP_NAME;
  });

  it('should succeed on first attempt when API responds correctly', async () => {
    mockCreate.mockResolvedValue(VALID_MAPPING_RESPONSE);

    const service = new OpenRouterService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.mapping['Full Name']).toBe('name');
    expect(result.mapping['Email']).toBe('email');
    expect(result.datasetType).toBe('CRM Leads');
    expect(result.confidence).toBe(95);
    expect(result.tokenUsage.totalTokens).toBe(110);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('should retry and succeed on transient 503 error', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockResolvedValueOnce(VALID_MAPPING_RESPONSE);

    const service = new OpenRouterService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.mapping['Full Name']).toBe('name');
    expect(result.confidence).toBe(95);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('should retry and succeed on rate limit (429) error', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('429 Too Many Requests'))
      .mockResolvedValueOnce(VALID_MAPPING_RESPONSE);

    const service = new OpenRouterService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.mapping['Full Name']).toBe('name');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('should throw INSUFFICIENT_CREDITS on insufficient_quota (402) without retrying', async () => {
    const err = new Error('insufficient_quota');
    (err as any).status = 402;
    mockCreate.mockRejectedValue(err);

    const service = new OpenRouterService();

    const error = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS).catch(e => e);

    expect(error).toBeInstanceOf(OpenRouterApiError);
    expect(error.code).toBe('INSUFFICIENT_CREDITS');
    expect(error.message).toContain('Insufficient credits');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('should retry on timeout error', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValueOnce(VALID_MAPPING_RESPONSE);

    const service = new OpenRouterService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.mapping['Full Name']).toBe('name');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('should throw MAX_RETRIES_EXCEEDED after exhausting all retries', async () => {
    mockCreate.mockRejectedValue(new Error('503 Service Unavailable'));

    const service = new OpenRouterService();

    const error = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS).catch(e => e);

    expect(error).toBeInstanceOf(OpenRouterApiError);
    expect(error.code).toBe('MAX_RETRIES_EXCEEDED');
    expect(error.message).toContain('after 3 attempts');
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('should throw immediately on 401 (invalid API key) without retrying', async () => {
    const err = new Error('401 Unauthorized');
    (err as any).status = 401;
    mockCreate.mockRejectedValue(err);

    const service = new OpenRouterService();

    const error = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS).catch(e => e);

    expect(error).toBeInstanceOf(OpenRouterApiError);
    expect(error.code).toBe('INVALID_API_KEY');
    expect(error.message).toContain('Invalid API key');
    // Should only have been called once (no retry on 401)
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('should throw immediately on 404 (model not found) without retrying', async () => {
    const err = new Error('404 Model not found');
    (err as any).status = 404;
    mockCreate.mockRejectedValue(err);

    const service = new OpenRouterService();

    const error = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS).catch(e => e);

    expect(error).toBeInstanceOf(OpenRouterApiError);
    expect(error.code).toBe('MODEL_NOT_FOUND');
    expect(error.message).toContain('not found');
    expect(error.message).toContain('openrouter/auto');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('should produce correct token usage metadata on success', async () => {
    mockCreate.mockResolvedValue(VALID_MAPPING_RESPONSE);

    const service = new OpenRouterService();
    const result = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS);

    expect(result.tokenUsage.totalTokens).toBe(110);
    expect(result.tokenUsage.promptTokens).toBe(80);
    expect(result.tokenUsage.completionTokens).toBe(30);
  });

  it('should handle empty response gracefully', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
    });

    const service = new OpenRouterService();

    const error = await service.getColumnMapping(SAMPLE_HEADERS, SAMPLE_ROWS).catch(e => e);

    expect(error).toBeInstanceOf(OpenRouterApiError);
    expect(error.message).toContain('Empty response');
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });
});

describe('OpenRouterService - Constructor', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MOCK_MODE;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_TEMPERATURE;
    delete process.env.OPENROUTER_MAX_TOKENS;
    delete process.env.OPENROUTER_REFERER;
    delete process.env.OPENROUTER_APP_NAME;
  });

  it('should warn when no API key and not in mock mode (but not throw)', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
    delete process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_MOCK_MODE = 'false';

    const service = new OpenRouterService();
    const config = service.getConfig();

    expect(config.apiKeyLoaded).toBe(false);
    expect(config.mockMode).toBe(false);
    expect(config.apiKeyPreview).toBe('N/A');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('OPENROUTER_API_KEY not set')
    );
    warnSpy.mockRestore();
  });

  it('should not throw in mock mode without API key', () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_MOCK_MODE = 'true';

    const service = new OpenRouterService();
    const config = service.getConfig();

    expect(config.apiKeyLoaded).toBe(false);
    expect(config.mockMode).toBe(true);
    expect(() => new OpenRouterService()).not.toThrow();
  });

  it('should warn on unusual API key format', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
    process.env.OPENROUTER_API_KEY = 'weird-key';
    process.env.OPENROUTER_MOCK_MODE = 'false';

    new OpenRouterService();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('OPENROUTER_API_KEY format looks unusual')
    );
    warnSpy.mockRestore();
  });

  it('should accept valid sk-or-v1- key format', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-key';
    process.env.OPENROUTER_MOCK_MODE = 'false';

    new OpenRouterService();

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('OPENROUTER_API_KEY format looks unusual')
    );
    warnSpy.mockRestore();
  });

  it('should return correct config via getConfig()', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-my-secret-key';
    process.env.OPENROUTER_MOCK_MODE = 'false';
    process.env.OPENROUTER_MODEL = 'google/gemma-3-27b-it:free';

    const service = new OpenRouterService();
    const config = service.getConfig();

    expect(config.apiKeyLoaded).toBe(true);
    expect(config.apiKeyPreview).toBe('sk-or-v1-' + '********');
    expect(config.model).toBe('google/gemma-3-27b-it:free');
    expect(config.mockMode).toBe(false);
    expect(config.referer).toBe('http://localhost:3000');
    expect(config.appName).toBe('EasyGrow');
  });
});
