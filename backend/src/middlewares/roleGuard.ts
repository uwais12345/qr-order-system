import { Request, Response, NextFunction } from 'express';
import { PlatformRole } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export function requirePlatformRole(role: PlatformRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (req.user.platformRole !== role) {
      next(new ForbiddenError(`Requires ${role} platform role`));
      return;
    }

    next();
  };
}
