import multer from 'multer';
import path from 'path';
import { AppError } from '../types';
import { generateFileId, sanitizeFileName, isAllowedMimeType } from '../utils/helpers';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800', 10); // 50MB for large CSV support

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const fileId = generateFileId();
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const sanitized = sanitizeFileName(baseName);
    cb(null, `${fileId}-${sanitized}${ext}`);
  },
});

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  if (
    isAllowedMimeType(file.mimetype) ||
    file.originalname.endsWith('.csv')
  ) {
    cb(null, true);
  } else {
    cb(new AppError('Only CSV files are allowed', 400));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});
