import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Known AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        statusCode: err.statusCode,
        details: err.details,
      },
    });
    return;
  }

  // 2. Zod Validation Error
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        statusCode: 400,
        issues: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    });
    return;
  }

  // 3. Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      res.status(409).json({
        success: false,
        error: {
          message: `Unique constraint violation: ${target} already exists`,
          statusCode: 409,
        },
      });
      return;
    }

    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: {
          message: 'Record not found in database',
          statusCode: 404,
        },
      });
      return;
    }
  }

  // 4. Unhandled / Unexpected Errors
  logger.error({ err }, 'Unhandled application exception');

  res.status(500).json({
    success: false,
    error: {
      message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      statusCode: 500,
      ...(env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
    },
  });
}
