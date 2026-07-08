import { SseProgressEvent, CrmRecord, ImportSummary } from '@/types';
import { API_BASE_URL } from '@/lib/config';

export type SseEventListener = (event: SseProgressEvent) => void;
export type SseErrorListener = (error: Error) => void;
export type SseCompleteListener = (records: CrmRecord[], summary: ImportSummary) => void;

/**
 * Connect to the SSE streaming endpoint for real-time batch processing.
 * Returns a cleanup function to abort the connection.
 */
export function connectMappingStream(
  fileId: string,
  {
    onProgress,
    onBatchComplete,
    onComplete,
    onError,
  }: {
    onProgress?: (current: number, total: number, message: string) => void;
    onBatchComplete?: (batchIndex: number, records: CrmRecord[], cumulativeSummary: ImportSummary) => void;
    onComplete?: (records: CrmRecord[], summary: ImportSummary) => void;
    onError?: (error: Error) => void;
  }
): () => void {
  const url = `${API_BASE_URL}/map/stream?fileId=${encodeURIComponent(fileId)}`;
  let eventSource: EventSource | null = null;
  let isAborted = false;

  // Accumulated state
  let allRecords: CrmRecord[] = [];
  let finalSummary: ImportSummary | null = null;
  let done = false;

  function connect() {
    if (isAborted) return;

    eventSource = new EventSource(url);

    eventSource.addEventListener('connected', (event: MessageEvent) => {
      const data = JSON.parse(event.data) as SseProgressEvent;
      if (data.totalBatches && data.message && onProgress) {
        onProgress(0, data.totalBatches, data.message);
      }
    });

    eventSource.addEventListener('batch-start', (event: MessageEvent) => {
      const data = JSON.parse(event.data) as SseProgressEvent;
      if (data.batchIndex !== undefined && data.totalBatches && data.message && onProgress) {
        onProgress(data.batchIndex, data.totalBatches, data.message);
      }
    });

    eventSource.addEventListener('batch-complete', (event: MessageEvent) => {
      const data = JSON.parse(event.data) as SseProgressEvent;

      if (data.batchRecords) {
        allRecords.push(...data.batchRecords);
      }

      if (data.cumulativeSummary) {
        finalSummary = data.cumulativeSummary;
      }

      if (data.batchIndex !== undefined && data.batchRecords && data.cumulativeSummary && onBatchComplete) {
        onBatchComplete(
          data.batchIndex,
          data.batchRecords,
          data.cumulativeSummary
        );
      }

      if (data.batchIndex !== undefined && data.totalBatches && data.message && onProgress) {
        onProgress(data.batchIndex + 1, data.totalBatches, data.message);
      }
    });

    eventSource.addEventListener('complete', (event: MessageEvent) => {
      const data = JSON.parse(event.data) as SseProgressEvent;

      done = true;

      if (data.allRecords) {
        allRecords = data.allRecords;
      }
      if (data.cumulativeSummary) {
        finalSummary = data.cumulativeSummary;
      }

      if (onComplete && finalSummary) {
        onComplete(allRecords, finalSummary);
      }

      eventSource?.close();
    });

    eventSource.addEventListener('error', (event: MessageEvent | Event) => {
      // Skip if we already completed successfully — EventSource fires 'error'
      // when the connection closes after the 'complete' event
      if (done) return;

      let errorMessage = 'Connection lost during AI processing. Please try again.';

      if (event instanceof MessageEvent && event.data) {
        try {
          const data = JSON.parse(event.data) as SseProgressEvent;
          if (data.error) {
            errorMessage = data.error;
          }
        } catch {
          // Ignore parse errors on the error event
        }
      }

      if (onError) {
        onError(new Error(errorMessage));
      }

      eventSource?.close();
    });
  }

  connect();

  // Return cleanup function
  return () => {
    isAborted = true;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}
