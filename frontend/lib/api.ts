import axios from 'axios';
import { ApiResponse, UploadPreviewData, MapResponseData } from '@/types';
import { API_BASE_URL } from '@/lib/config';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes for AI batch processing
  headers: {
    'Content-Type': 'application/json',
  },
});

// ===== Retry Interceptor for Render Cold Start =====
// Render free tier spins down after inactivity. The first request after
// a period of inactivity will fail with a connection error. We retry
// with exponential backoff to give Render time to wake up.

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000; // 2 seconds initial delay

function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const axiosError = error as { code?: string; message?: string };
  // Network errors and connection refused — common when Render is cold-starting
  return (
    axiosError.code === 'ERR_NETWORK' ||
    axiosError.code === 'ECONNABORTED' ||
    axiosError.code === 'ERR_CONNECTION_REFUSED' ||
    axiosError.code === 'ERR_CONNECTION_RESET' ||
    axiosError.message?.includes('timeout') ||
    axiosError.message?.includes('connect') ||
    axiosError.message?.includes('Network Error') ||
    axiosError.message?.includes('socket hang up') ||
    axiosError.message?.includes('connect ECONNREFUSED')
  );
}

function getColdStartDelay(attempt: number): number {
  // Exponential backoff: 2s, 4s, 8s
  return Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), 10000);
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    // Avoid infinite retry loops
    if (originalRequest._retryCount === undefined) {
      originalRequest._retryCount = 0;
    }

    if (
      isRetryableError(error) &&
      originalRequest._retryCount < MAX_RETRIES
    ) {
      originalRequest._retryCount += 1;
      const delay = getColdStartDelay(originalRequest._retryCount);

      // Create a custom error that the UI can detect as a cold-start retry
      const isFirstRetry = originalRequest._retryCount === 1;
      const coldStartError = new Error(
        isFirstRetry
          ? 'Server is starting up...'
          : `Server is starting up (retry ${originalRequest._retryCount}/${MAX_RETRIES})...`
      );
      coldStartError.name = 'ColdStartRetry';

      return new Promise((resolve, reject) => {
        setTimeout(() => {
          apiClient(originalRequest)
            .then(resolve)
            .catch(reject);
        }, delay);
      });
    }

    // Pass through if not retryable or max retries reached
    return Promise.reject(error);
  }
);

/**
 * Upload a CSV file and get preview data.
 * The full parsed CSV is cached server-side for subsequent AI processing.
 */
export async function uploadCsvFile(file: File): Promise<ApiResponse<UploadPreviewData>> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<ApiResponse<UploadPreviewData>>('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 30000, // 30s for upload + parse
  });

  return response.data;
}

/**
 * Map a previously uploaded CSV to CRM schema using AI.
 * Uses the fileId returned from the upload endpoint to reference cached data.
 */
export async function mapCsvToCrm(
  fileId: string
): Promise<ApiResponse<MapResponseData>> {
  const response = await apiClient.post<ApiResponse<MapResponseData>>('/map', {
    fileId,
  });

  return response.data;
}
