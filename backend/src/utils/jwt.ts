import jwt, { SignOptions } from 'jsonwebtoken';
import { PlatformRole } from '@prisma/client';
import { env } from '../config/env.js';
import { UnauthorizedError } from './errors.js';

export interface UserTokenPayload {
  userId: string;
  email: string;
  platformRole: PlatformRole;
}

export function generateAccessToken(payload: UserTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as unknown as SignOptions['expiresIn'],
    issuer: 'serveqr-auth',
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function generateRefreshToken(payload: UserTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as unknown as SignOptions['expiresIn'],
    issuer: 'serveqr-auth',
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): UserTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'serveqr-auth' }) as UserTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Access token expired');
    }
    throw new UnauthorizedError('Invalid access token');
  }
}

export function verifyRefreshToken(token: string): UserTokenPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'serveqr-auth' }) as UserTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token expired');
    }
    throw new UnauthorizedError('Invalid refresh token');
  }
}
