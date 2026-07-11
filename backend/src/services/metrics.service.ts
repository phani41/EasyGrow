import { Request, Response, NextFunction } from 'express';
import promClient from 'prom-client';

const register = new promClient.Registry();

promClient.collectDefaultMetrics({
  register,
  prefix: 'easygrow_',
});

export const uploadCounter = new promClient.Counter({
  name: 'easygrow_uploads_total',
  help: 'Total number of CSV file uploads',
  labelNames: ['status'],
  registers: [register],
});

export const importCounter = new promClient.Counter({
  name: 'easygrow_imports_total',
  help: 'Total number of CSV-to-CRM imports',
  labelNames: ['status', 'method'],
  registers: [register],
});

export const recordsProcessed = new promClient.Counter({
  name: 'easygrow_records_processed_total',
  help: 'Total number of records processed',
  registers: [register],
});

export const recordsSkipped = new promClient.Counter({
  name: 'easygrow_records_skipped_total',
  help: 'Total number of records skipped (no contact info)',
  registers: [register],
});

export const aiCallsTotal = new promClient.Counter({
  name: 'easygrow_ai_calls_total',
  help: 'Total number of AI API calls made',
  labelNames: ['provider', 'status'],
  registers: [register],
});

export const mappingCacheHits = new promClient.Counter({
  name: 'easygrow_mapping_cache_hits_total',
  help: 'Total number of mapping cache hits',
  registers: [register],
});

export const mappingCacheMisses = new promClient.Counter({
  name: 'easygrow_mapping_cache_misses_total',
  help: 'Total number of mapping cache misses',
  registers: [register],
});

export const processingDuration = new promClient.Histogram({
  name: 'easygrow_processing_duration_seconds',
  help: 'Duration of import processing in seconds',
  labelNames: ['method'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [register],
});

export const mappingStrategy = new promClient.Counter({
  name: 'easygrow_mapping_strategy_total',
  help: 'Total imports by mapping strategy',
  labelNames: ['strategy'],
  registers: [register],
});

export const datasetTypes = new promClient.Counter({
  name: 'easygrow_dataset_types_total',
  help: 'Total imports by dataset type',
  labelNames: ['type'],
  registers: [register],
});

export async function metricsHandler(_req: Request, res: Response, _next: NextFunction): Promise<void> {
  try {
    res.setHeader('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.status(200).send(metrics);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate metrics',
    });
  }
}

export { register };
