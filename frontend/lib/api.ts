import axios from 'axios';
import { ApiResponse, UploadPreviewData, MapResponseData } from '@/types';
import { API_BASE_URL } from '@/lib/config';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
    (axiosError.message?.includes('timeout') ?? false) ||
    (axiosError.message?.includes('connect') ?? false) ||
    (axiosError.message?.includes('Network Error') ?? false) ||
    (axiosError.message?.includes('socket hang up') ?? false) ||
    (axiosError.message?.includes('connect ECONNREFUSED') ?? false)
  );
}

function getColdStartDelay(attempt: number): number {
  return Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), 10000);
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as typeof error.config & { _retryCount?: number };
    const retryCount = originalRequest._retryCount ?? 0;
    originalRequest._retryCount = retryCount;

    if (isRetryableError(error) && retryCount < MAX_RETRIES) {
      originalRequest._retryCount = retryCount + 1;
      const delay = getColdStartDelay(originalRequest._retryCount);

      return new Promise<typeof error>((resolve, reject) => {
        setTimeout(() => {
          apiClient(originalRequest)
            .then(resolve)
            .catch(reject);
        }, delay);
      });
    }

    return Promise.reject(error);
  }
);

export async function uploadCsvFile(file: File): Promise<ApiResponse<UploadPreviewData>> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<ApiResponse<UploadPreviewData>>('/api/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 30000, // 30s for upload + parse
  });

  return response.data;
}

export async function mapCsvToCrm(
  fileId: string
): Promise<ApiResponse<MapResponseData>> {
  const response = await apiClient.post<ApiResponse<MapResponseData>>('/api/map', {
    fileId,
  });

  return response.data;
}
