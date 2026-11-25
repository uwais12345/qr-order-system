/**
 * Normalizes an Indian mobile number by stripping non-digits and leading +91 or 0.
 */
export function normalizeIndianMobile(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

/**
 * Validates that a phone number normalizes to a 10-digit Indian mobile number (6-9 prefix).
 */
export function isValidIndianMobile(phone: string): boolean {
  const normalized = normalizeIndianMobile(phone);
  return /^[6-9]\d{9}$/.test(normalized);
}
