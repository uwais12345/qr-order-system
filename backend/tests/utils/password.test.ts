import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/utils/password.js';

describe('Password Utilities (Argon2id)', () => {
  it('should hash a password and verify it correctly', async () => {
    const rawPassword = 'serveqr_secret_pass_2026';
    const hash = await hashPassword(rawPassword);

    expect(hash).toBeDefined();
    expect(hash.startsWith('$argon2id$')).toBe(true);

    const isMatch = await verifyPassword(rawPassword, hash);
    expect(isMatch).toBe(true);
  });

  it('should reject an incorrect password', async () => {
    const hash = await hashPassword('correct_password');
    const isMatch = await verifyPassword('wrong_password', hash);

    expect(isMatch).toBe(false);
  });

  it('should return false safely when hash is malformed', async () => {
    const isMatch = await verifyPassword('any_password', 'invalid_hash_string');
    expect(isMatch).toBe(false);
  });
});
