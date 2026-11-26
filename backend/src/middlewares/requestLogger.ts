import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Assigns an x-request-id correlation header and logs HTTP request metrics
 * without exposing sensitive headers, tokens, or payment secrets (NFR-11).
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const requestId =
    typeof incomingId === 'string' && incomingId.trim().length > 0
      ? incomingId.trim()
      : crypto.randomUUID();

  res.setHeader('x-request-id', requestId);
  const startHr = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startHr) / 1_000_000;
    const logPayload = {
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    };

    if (res.statusCode >= 500) {
      logger.error(logPayload, 'HTTP request failed');
    } else if (res.statusCode >= 400) {
      logger.warn(logPayload, 'HTTP request client error');
    } else {
      logger.info(logPayload, 'HTTP request completed');
    }
  });

  next();
}
