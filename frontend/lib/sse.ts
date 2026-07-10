import { SseProgressEvent, CrmRecord, ImportSummary } from '@/types';
import { API_BASE_URL } from '@/lib/config';

export type SseEventListener = (event: SseProgressEvent) => void;
export type SseErrorListener = (error: Error) => void;
export type SseCompleteListener = (records: CrmRecord[], summary: ImportSummary) => void;

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 2000;
const SSE_TIMEOUT_MS = 600_000; // 10 minutes — if no events received in 10 min, timeout

/**
 * Connect to the SSE streaming endpoint for real-time batch processing.
 * Includes automatic reconnection with exponential backoff for Render cold starts.
 * Returns a cleanup function to abort the connection.
 */
export function connectMappingStream(
  fileId: string,
  {
    onProgress,
    onBatchComplete,
    onComplete,
    onError,
    onReconnecting,
  }: {
    onProgress?: (current: number, total: number, message: string) => void;
    onBatchComplete?: (batchIndex: number, records: CrmRecord[], cumulativeSummary: ImportSummary) => void;
    onComplete?: (records: CrmRecord[], summary: ImportSummary) => void;
    onError?: (error: Error) => void;
    onReconnecting?: (attempt: number, maxAttempts: number) => void;
  }
): () => void {
  const url = `${API_BASE_URL}/api/map/stream?fileId=${encodeURIComponent(fileId)}`;
  let eventSource: EventSource | null = null;
  let isAborted = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastEventTime = Date.now();
  let timeoutTimer: ReturnType<typeof setInterval> | null = null;

  // Accumulated state
  let allRecords: CrmRecord[] = [];
  let finalSummary: ImportSummary | null = null;
  let done = false;

  function cleanup() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (timeoutTimer) {
      clearInterval(timeoutTimer);
      timeoutTimer = null;
    }
  }

  function connect() {
    if (isAborted || done) return;

    cleanup();
    eventSource = new EventSource(url);

    // Track last event time for timeout detection
    lastEventTime = Date.now();

    // Start a heartbeat check to detect silent disconnects
    if (!timeoutTimer) {
      timeoutTimer = setInterval(() => {
        if (done || isAborted) return;
        const elapsed = Date.now() - lastEventTime;
        if (elapsed > SSE_TIMEOUT_MS) {
          // No events received within timeout — treat as stale connection
          if (onError) {
            onError(new Error('Connection timed out. Please try again.'));
          }
          cleanup();
        }
      }, 30_000);
    }

    eventSource.addEventListener('connected', (event: MessageEvent) => {
      lastEventTime = Date.now();
      reconnectAttempts = 0; // Reset reconnect counter on successful connection
      const data = JSON.parse(event.data) as SseProgressEvent;
      if (data.totalBatches && data.message && onProgress) {
        onProgress(0, data.totalBatches, data.message);
      }
    });

    eventSource.addEventListener('batch-start', (event: MessageEvent) => {
      lastEventTime = Date.now();
      const data = JSON.parse(event.data) as SseProgressEvent;
      if (data.batchIndex !== undefined && data.totalBatches && data.message && onProgress) {
        onProgress(data.batchIndex, data.totalBatches, data.message);
      }
    });

    eventSource.addEventListener('batch-complete', (event: MessageEvent) => {
      lastEventTime = Date.now();
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
      lastEventTime = Date.now();
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

      cleanup();
    });

    eventSource.addEventListener('error', (event: MessageEvent | Event) => {
      // Skip if we already completed successfully
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

      // Attempt automatic reconnect with exponential backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !done && !isAborted) {
        reconnectAttempts++;
        const delay = Math.min(
          BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1),
          30000 // Max 30s between reconnect attempts
        );

        if (onReconnecting) {
          onReconnecting(reconnectAttempts, MAX_RECONNECT_ATTEMPTS);
        }

        reconnectTimer = setTimeout(() => {
          if (!isAborted && !done) {
            connect();
          }
        }, delay);
      } else {
        // Max reconnects reached — give up
        if (onError) {
          onError(new Error(errorMessage));
        }
        cleanup();
      }
    });
  }

  connect();

  // Return cleanup function
  return () => {
    isAborted = true;
    cleanup();
  };
}
