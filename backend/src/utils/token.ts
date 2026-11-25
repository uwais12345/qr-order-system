import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * Generates a cryptographically strong URL-safe token.
 */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Computes a server-peppered HMAC-SHA256 digest of a raw QR token.
 * Only the hash is stored in the database; raw tokens are returned once at creation.
 */
export function hashQrToken(rawToken: string): string {
  return crypto.createHmac('sha256', env.QR_TOKEN_PEPPER).update(rawToken).digest('hex');
}

/**
 * Computes a server-peppered HMAC-SHA256 digest of a guest session token.
 */
export function hashGuestToken(rawToken: string): string {
  return crypto.createHmac('sha256', env.GUEST_TOKEN_SECRET).update(rawToken).digest('hex');
}

/**
 * Builds the customer-facing QR menu path containing restaurant slug, table code, and token.
 */
export function buildQrMenuPath(
  restaurantSlug: string,
  tableCode: string,
  rawToken: string,
  branchId?: string
): string {
  const params = new URLSearchParams({
    table: tableCode,
    token: rawToken,
  });
  if (branchId) {
    params.set('branch', branchId);
  }
  return `/menu/${encodeURIComponent(restaurantSlug)}?${params.toString()}`;
}
