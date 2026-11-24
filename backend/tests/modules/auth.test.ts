import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';

vi.mock('../../src/config/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

describe('Auth API Integration & Validation', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject login request with missing body or invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('Validation failed');
    expect(res.body.error.issues).toBeDefined();
  });

  it('should reject login with non-existent credentials with 401', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'unknown@user.com', password: 'randompassword123' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('should return 401 on /api/v1/auth/me without authorization header', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 404 for an unknown endpoint', async () => {
    const res = await request(app).get('/api/v1/unknown-endpoint');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
