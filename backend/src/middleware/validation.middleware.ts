import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types';

export function validateMapRequest(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const { fileId } = req.body;

  if (!fileId || typeof fileId !== 'string' || fileId.trim().length === 0) {
    next(new AppError('Missing or invalid field: fileId must be a non-empty string', 400));
    return;
  }

  req.body.fileId = fileId.trim();
  next();
}

