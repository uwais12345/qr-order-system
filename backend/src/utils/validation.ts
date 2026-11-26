import { z } from 'zod';

const DATA_IMAGE_REGEX = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

/**
 * Validates HTTP(S) URLs, relative asset paths (/assets/...), or inline image data URIs
 * while blocking executable schemes (e.g., javascript:, data:text/html).
 */
export function isSafeMediaUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//');
  }
  if (trimmed.startsWith('data:')) {
    return DATA_IMAGE_REGEX.test(trimmed);
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function safeMediaUrlSchema(label = 'URL', maxLength = 200_000) {
  return z
    .string()
    .max(maxLength, `${label} exceeds maximum allowed size`)
    .refine(isSafeMediaUrl, {
      message: `Invalid ${label}: must be an http(s) URL, relative asset path, or base64 image data URI`,
    });
}
