import { describe, it, expect } from 'vitest';
import { PlatformRole } from '@prisma/client';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../src/utils/jwt.js';
import { UnauthorizedError } from '../../src/utils/errors.js';

describe('JWT Utilities', () => {
  const mockPayload = {
    userId: 'user-uuid-1234',
    email: 'test@serveqr.io',
    platformRole: PlatformRole.SUPER_ADMIN,
  };

  it('should generate and verify an access token', () => {
    const token = generateAccessToken(mockPayload);
    expect(typeof token).toBe('string');

    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(mockPayload.userId);
    expect(decoded.email).toBe(mockPayload.email);
    expect(decoded.platformRole).toBe(PlatformRole.SUPER_ADMIN);
  });

  it('should generate and verify a refresh token', () => {
    const refreshToken = generateRefreshToken(mockPayload);
    expect(typeof refreshToken).toBe('string');

    const decoded = verifyRefreshToken(refreshToken);
    expect(decoded.userId).toBe(mockPayload.userId);
    expect(decoded.email).toBe(mockPayload.email);
  });

  it('should reject tampered tokens', () => {
    const token = generateAccessToken(mockPayload);
    const tampered = token.slice(0, -5) + 'xxxxx';

    expect(() => verifyAccessToken(tampered)).toThrow(UnauthorizedError);
  });

  it('should reject refresh token when verified with access token function', () => {
    const refreshToken = generateRefreshToken(mockPayload);
    // Refresh token is signed with JWT_REFRESH_SECRET, verifyAccessToken uses JWT_ACCESS_SECRET
    expect(() => verifyAccessToken(refreshToken)).toThrow(UnauthorizedError);
  });
});
