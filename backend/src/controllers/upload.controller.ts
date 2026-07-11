import { Request, Response, NextFunction } from 'express';
import { CsvService } from '../services/csv.service';
import { OpenRouterService } from '../services/openrouter.service';
import { MappingService } from '../services/mapping.service';
import { csvCache } from '../services/cache.service';
import { logger } from '../services/logger.service';
import { AppError, ApiResponse, CrmRecord, ImportSummary, BatchProgressEvent } from '../types';

let _csvService: CsvService | null = null;
let _openrouterService: OpenRouterService | null = null;
let _mappingService: MappingService | null = null;

function getCsvService(): CsvService {
  if (!_csvService) _csvService = new CsvService();
  return _csvService;
}

function getOpenRouterService(): OpenRouterService {
  if (!_openrouterService) _openrouterService = new OpenRouterService();
  return _openrouterService;
}

function getMappingService(): MappingService {
  if (!_mappingService) _mappingService = new MappingService(getOpenRouterService());
  return _mappingService;
}

export const uploadCsv = async (
  req: Request,
  res: Response<ApiResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;

    const { data: parsed, validation } = await getCsvService().parseFile(filePath, fileName);

    if (!validation.valid) {
      getCsvService().cleanupFile(filePath);
      res.status(422).json({
        success: false,
        error: 'CSV validation failed',
        data: { validation, fileName },
      });
      return;
    }

    csvCache.set(parsed.fileId, {
      headers: parsed.headers,
      rows: parsed.rows,
      fileName: parsed.fileName,
      totalRows: parsed.totalRows,
    });

    getCsvService().cleanupFile(filePath);

    res.status(200).json({
      success: true,
      data: {
        fileId: parsed.fileId,
        fileName: parsed.fileName,
        totalRows: parsed.totalRows,
        headers: parsed.headers,
        previewRows: parsed.rows.slice(0, 10),
        validation: {
          warnings: validation.warnings,
          warningCount: validation.warningCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const mapCsvToCrm = async (
  req: Request,
  res: Response<ApiResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { fileId } = req.body as { fileId: string };

    if (!fileId) {
      throw new AppError('Missing required field: fileId', 400);
    }

    const cachedData = csvCache.get(fileId);
    if (!cachedData) {
      throw new AppError('CSV data not found or expired. Please re-upload the file.', 404);
    }

    const { headers, rows, fileName } = cachedData;

    if (rows.length === 0) {
      throw new AppError('No rows to process', 400);
    }

    const mappingService = getMappingService();
    const dataSource = mappingService.detectDataSourceFromFile(fileName) || '';

    const classification = mappingService.classifyDataset(headers, rows);
    const compatibility = mappingService.isDatasetCompatible(classification);

    if (!compatibility.compatible) {
      csvCache.delete(fileId);
      res.status(422).json({
        success: false,
        error: compatibility.reason || 'Dataset is not compatible with CRM import.',
        data: {
          classification,
          fileName,
        },
      });
      return;
    }

    const mappingResult = await mappingService.getMapping(headers, rows);

    const requiredFields = mappingService.hasRequiredFields(mappingResult.mapping);
    if (!requiredFields.valid) {
      csvCache.delete(fileId);
      const typeLabel = classification.datasetType !== 'Unknown'
        ? `"${classification.datasetType}" dataset`
        : 'dataset';
      res.status(422).json({
        success: false,
        error: `This ${typeLabel} does not contain required CRM fields (email or phone). ` +
          'Please upload a CSV with contact information.',
        data: {
          classification,
          mapping: mappingResult,
          fileName,
        },
      });
      return;
    }

    const LOCAL_BATCH_SIZE = 1000;
    const totalBatches = getCsvService().getTotalBatches(rows.length, LOCAL_BATCH_SIZE);
    const { records, summary } = mappingService.applyMapping(
      rows,
      headers,
      mappingResult.mapping,
      mappingResult,
      dataSource,
    );

    // Clean up cache after processing
    csvCache.delete(fileId);

    res.status(200).json({
      success: true,
      data: {
        records,
        totalProcessed: records.length,
        totalBatches,
        summary,
        // Non-breaking extra fields for the new engine
        datasetType: mappingResult.datasetType,
        confidence: mappingResult.confidence,
        usedRuleBased: mappingResult.usedRuleBased,
        cacheHit: mappingResult.cacheHit,
      },
    });
  } catch (error) {
    next(error);
  }
};

function sendSSEEvent(res: Response, eventName: string, data: Record<string, unknown>): void {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * GET /api/map/stream?fileId=xxx
 * Stream processing results via SSE for real-time progress tracking.
 * New flow: classify → get mapping → apply locally in batches.
 */
export const mapCsvToCrmStream = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const fileId = req.query.fileId as string;

  if (!fileId) {
    res.status(400).json({ success: false, error: 'Missing required query param: fileId' });
    return;
  }

  const cachedData = csvCache.get(fileId);
  if (!cachedData) {
    res.status(404).json({
      success: false,
      error: 'CSV data not found or expired. Please re-upload the file.',
    });
    return;
  }

  const { headers, rows, fileName } = cachedData;

  if (rows.length === 0) {
    res.status(400).json({ success: false, error: 'No rows to process' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const mappingService = getMappingService();
  const dataSource = mappingService.detectDataSourceFromFile(fileName) || '';

  const allRecords: CrmRecord[] = [];
  const cumulativeSummary: ImportSummary = {
    totalProcessed: 0,
    skippedNoContact: 0,
    skippedInvalid: 0,
    emailsExtracted: 0,
    phonesExtracted: 0,
  };

  let aborted = false;
  let bytesWritten = 0;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let connectionTimeout: ReturnType<typeof setTimeout> | null = null;

  const cleanupConnection = () => {
    aborted = true;
    if (heartbeatInterval !== null) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (connectionTimeout !== null) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
  };

  req.on('close', () => {
    if (aborted) return;
    cleanupConnection();
    logger.info({ fileId, bytesWritten }, 'SSE client disconnected');
  });

  const originalWrite = res.write.bind(res);
  res.write = function (chunk: any, ...args: any[]) {
    bytesWritten += Buffer.byteLength(chunk, 'utf8');
    return originalWrite(chunk, ...args);
  };

  heartbeatInterval = setInterval(() => {
    try {
      if (!aborted) res.write(':heartbeat\n\n');
    } catch {
      cleanupConnection();
    }
  }, 15_000);
  heartbeatInterval.unref();

  connectionTimeout = setTimeout(() => {
    if (!aborted) {
      cleanupConnection();
      logger.warn({ fileId }, 'SSE connection timed out');
      sendSSEEvent(res, 'error', {
        type: 'error',
        error: 'Processing timed out after 30 minutes.',
        message: 'The import took too long. Please try again with a smaller file.',
      });
      res.end();
    }
  }, 30 * 60 * 1000);
  connectionTimeout.unref();

  try {
    // Step 1: Send initial connection event
    sendSSEEvent(res, 'connected', {
      type: 'batch-start',
      totalBatches: Math.ceil(rows.length / 1000),
      message: `Analyzing ${rows.length.toLocaleString()} rows...`,
    });

    if (typeof (res as any).flush === 'function') (res as any).flush();

    // Step 2: Classify dataset
    const classification = mappingService.classifyDataset(headers, rows);
    const compatibility = mappingService.isDatasetCompatible(classification);

    if (!compatibility.compatible || aborted) {
      cleanupConnection();
      csvCache.delete(fileId);

      if (compatibility.compatible && aborted) return; // Just disconnected

      sendSSEEvent(res, 'error', {
        type: 'error',
        error: compatibility.reason || 'Dataset is not compatible with CRM import.',
        message: compatibility.reason || 'Dataset is not compatible with CRM import.',
      });
      res.end();
      return;
    }

    // Step 3: Get column mapping (rules or AI)
    sendSSEEvent(res, 'mapping-start', {
      type: 'batch-start',
      message: 'Generating column mapping...',
    });

    if (typeof (res as any).flush === 'function') (res as any).flush();

    const mappingResult = await mappingService.getMapping(headers, rows);

    if (aborted) {
      cleanupConnection();
      csvCache.delete(fileId);
      return;
    }

    // Step 4: Validate required fields
    const requiredFields = mappingService.hasRequiredFields(mappingResult.mapping);
    if (!requiredFields.valid) {
      cleanupConnection();
      csvCache.delete(fileId);

      const typeLabel = classification.datasetType !== 'Unknown'
        ? `"${classification.datasetType}" dataset`
        : 'dataset';
      sendSSEEvent(res, 'error', {
        type: 'error',
        error: `This ${typeLabel} does not contain required CRM fields (email or phone). Please upload a CSV with contact information.`,
        message: 'Dataset incompatible: no email or phone columns found.',
      });
      res.end();
      return;
    }

    // Step 5: Apply mapping locally in batches (for progress reporting)
    const LOCAL_BATCH_SIZE = 500;
    const totalLocalBatches = Math.ceil(rows.length / LOCAL_BATCH_SIZE);

    sendSSEEvent(res, 'mapping-complete', {
      type: 'batch-start',
      totalBatches: totalLocalBatches,
      message: `Mapping complete. Processing ${rows.length.toLocaleString()} rows in ${totalLocalBatches} local batch${totalLocalBatches !== 1 ? 'es' : ''}...`,
      mappingInfo: {
        datasetType: mappingResult.datasetType,
        confidence: mappingResult.confidence,
        usedRuleBased: mappingResult.usedRuleBased,
        cacheHit: mappingResult.cacheHit,
      },
    });

    if (typeof (res as any).flush === 'function') (res as any).flush();

    // Process in batches and send progress
    for (let i = 0; i < totalLocalBatches && !aborted; i++) {
      const start = i * LOCAL_BATCH_SIZE;
      const end = Math.min(start + LOCAL_BATCH_SIZE, rows.length);
      const batchRows = rows.slice(start, end);

      sendSSEEvent(res, 'batch-start', {
        type: 'batch-start',
        batchIndex: i,
        totalBatches: totalLocalBatches,
        message: `Processing batch ${i + 1} of ${totalLocalBatches} (${batchRows.length} rows)`,
      });

      const { records: batchRecords, summary: batchSummary } = mappingService.applyMapping(
        batchRows,
        headers,
        mappingResult.mapping,
        mappingResult,
        dataSource,
      );

      if (aborted) break;

      allRecords.push(...batchRecords);
      cumulativeSummary.totalProcessed += batchSummary.totalProcessed;
      cumulativeSummary.skippedNoContact += batchSummary.skippedNoContact;
      cumulativeSummary.skippedInvalid += batchSummary.skippedInvalid;
      cumulativeSummary.emailsExtracted += batchSummary.emailsExtracted;
      cumulativeSummary.phonesExtracted += batchSummary.phonesExtracted;

      sendSSEEvent(res, 'batch-complete', {
        type: 'batch-complete',
        batchIndex: i,
        totalBatches: totalLocalBatches,
        batchRecords,
        cumulativeSummary: { ...cumulativeSummary },
        message: `Batch ${i + 1} complete — ${batchRecords.length} records extracted`,
      });

      if (typeof (res as any).flush === 'function') (res as any).flush();
    }

    // Clean up after completion
    cleanupConnection();
    csvCache.delete(fileId);

    sendSSEEvent(res, 'complete', {
      type: 'complete',
      allRecords,
      cumulativeSummary: { ...cumulativeSummary },
      message: `Import complete — ${cumulativeSummary.totalProcessed.toLocaleString()} records processed`,
      mappingInfo: {
        datasetType: mappingResult.datasetType,
        confidence: mappingResult.confidence,
        usedRuleBased: mappingResult.usedRuleBased,
        cacheHit: mappingResult.cacheHit,
      },
    });

    res.end();
  } catch (error) {
    cleanupConnection();

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SSE] Processing failed: ${errorMessage}`);

    sendSSEEvent(res, 'error', {
      type: 'error',
      error: errorMessage,
      message: 'Processing failed. Please try again.',
    });

    res.end();
  }
};
