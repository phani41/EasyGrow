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
