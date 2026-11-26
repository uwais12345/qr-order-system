import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';

vi.mock('../../src/config/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

describe('Operational Probes, Request Correlation & OpenAPI Spec', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 UP with x-request-id on /health, /api/v1/health, and /api/v1/ready', async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ '?column?': 1 }]);

    const [h1, h2, ready] = await Promise.all([
      request(app).get('/health'),
      request(app).get('/api/v1/health'),
      request(app).get('/api/v1/ready').set('x-request-id', 'req-trace-123'),
    ]);

    expect(h1.status).toBe(200);
    expect(h1.body.status).toBe('UP');
    expect(h1.headers['x-request-id']).toBeDefined();

    expect(h2.status).toBe(200);
    expect(h2.body.database).toBe('CONNECTED');

    expect(ready.status).toBe(200);
    expect(ready.headers['x-request-id']).toBe('req-trace-123');
  });

  it('returns 503 DOWN on /api/v1/ready when database connectivity fails', async () => {
    (prisma.$queryRaw as any).mockRejectedValueOnce(new Error('DB connection refused'));

    const res = await request(app).get('/api/v1/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('DOWN');
    expect(res.body.database).toBe('DISCONNECTED');
  });

  it('serves OpenAPI 3.0.3 contract at /api/v1/openapi.json', async () => {
    const res = await request(app).get('/api/v1/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.info.title).toBe('ServeQR API');
    expect(res.body.components.securitySchemes).toHaveProperty('BearerAuth');
    expect(res.body.components.securitySchemes).toHaveProperty('GuestTokenAuth');
    expect(res.body.paths).toHaveProperty('/auth/login');
    expect(res.body.paths).toHaveProperty('/guest/orders');
    expect(res.body.paths).toHaveProperty('/webhooks/razorpay');
  });
});
