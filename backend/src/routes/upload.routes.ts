import { Router } from 'express';
import { upload } from '../middleware/upload.middleware';
import { uploadCsv, mapCsvToCrm, mapCsvToCrmStream } from '../controllers/upload.controller';
import { validateMapRequest } from '../middleware/validation.middleware';
import { uploadRateLimiter, mapRateLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// POST /api/upload - Upload and parse CSV
// Rate limited to prevent abuse
router.post(
  '/upload',
  uploadRateLimiter,
  upload.single('file'),
  uploadCsv
);

// POST /api/map - Map CSV data to CRM schema using AI (non-streaming)
// Validates fileId, rate limited (AI calls are costly)
router.post(
  '/map',
  mapRateLimiter,
  validateMapRequest,
  mapCsvToCrm
);

// GET /api/map/stream - Stream batch processing results via SSE
// Provides real-time progress updates during AI processing
router.get(
  '/map/stream',
  mapRateLimiter,
  mapCsvToCrmStream
);

export default router;
