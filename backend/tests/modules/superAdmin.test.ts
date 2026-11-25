import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { PlatformRole, RestaurantRole, SubscriptionStatus } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';
import { generateAccessToken } from '../../src/utils/jwt.js';

vi.mock('../../src/config/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    restaurant: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    subscriptionPlan: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    restaurantSubscription: {
      groupBy: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    customerOrder: { count: vi.fn() },
    payment: { aggregate: vi.fn() },
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    tenant: { create: vi.fn() },
    branch: { create: vi.fn() },
    restaurantMembership: { create: vi.fn() },
    taxRule: { createMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

describe('Super Admin Module API', () => {
  const app = createApp();

  const superAdminToken = generateAccessToken({
    userId: 'sa-uuid',
    email: 'admin@serveqr.io',
    platformRole: PlatformRole.SUPER_ADMIN,
  });

  const ownerToken = generateAccessToken({
    userId: 'owner-uuid',
    email: 'rahul@abcrestaurant.in',
    platformRole: PlatformRole.RESTAURANT_USER,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects non-SUPER_ADMIN users with 403 Forbidden', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'owner-uuid',
      email: 'rahul@abcrestaurant.in',
      displayName: 'Rahul',
      platformRole: PlatformRole.RESTAURANT_USER,
      status: 'ACTIVE',
      memberships: [],
    });

    const res = await request(app)
      .get('/api/v1/super-admin/restaurants')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns dashboard metrics for SUPER_ADMIN', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'sa-uuid',
      email: 'admin@serveqr.io',
      displayName: 'Admin',
      platformRole: PlatformRole.SUPER_ADMIN,
      status: 'ACTIVE',
      memberships: [],
    });
    (prisma.restaurant.count as any).mockResolvedValueOnce(5).mockResolvedValueOnce(4);
    (prisma.customerOrder.count as any).mockResolvedValue(120);
    (prisma.payment.aggregate as any).mockResolvedValue({ _sum: { amount: '54200.00' } });
    (prisma.restaurantSubscription.groupBy as any).mockResolvedValue([
      { status: SubscriptionStatus.ACTIVE, _count: { id: 4 } },
    ]);
    (prisma.auditLog.findMany as any).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/super-admin/dashboard')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.restaurants).toEqual({ total: 5, active: 4, inactive: 1 });
    expect(res.body.data.verifiedPaymentRevenue).toBe('54200.00');
  });

  it('creates a restaurant with tenant, branch, owner, subscription, taxes, and audit log atomically', async () => {
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({
        id: 'sa-uuid',
        email: 'admin@serveqr.io',
        displayName: 'Admin',
        platformRole: PlatformRole.SUPER_ADMIN,
        status: 'ACTIVE',
        memberships: [],
      })
      .mockResolvedValueOnce(null); // ownerEmail uniqueness check
    (prisma.restaurant.findUnique as any).mockResolvedValueOnce(null); // slug check
    (prisma.subscriptionPlan.findUnique as any).mockResolvedValueOnce({
      id: 'plan-pro',
      code: 'PROFESSIONAL',
      billingPeriod: 'MONTHLY',
    });

    const txMock = {
      tenant: { create: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'Spice House' }) },
      restaurant: {
        create: vi.fn().mockResolvedValue({
          id: 'rst-new',
          name: 'Spice House',
          slug: 'spice-house',
        }),
      },
      branch: { create: vi.fn().mockResolvedValue({ id: 'br-1', name: 'Main Branch' }) },
      user: {
        create: vi.fn().mockResolvedValue({
          id: 'owner-new',
          email: 'owner@spicehouse.in',
          displayName: 'Vikram',
        }),
      },
      restaurantMembership: { create: vi.fn().mockResolvedValue({ id: 'mem-1' }) },
      restaurantSubscription: {
        create: vi.fn().mockResolvedValue({ id: 'sub-1', status: SubscriptionStatus.ACTIVE }),
      },
      taxRule: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(txMock));

    const res = await request(app)
      .post('/api/v1/super-admin/restaurants')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Spice House',
        ownerName: 'Vikram',
        ownerEmail: 'owner@spicehouse.in',
        ownerPassword: 'password123',
        planCode: 'PROFESSIONAL',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.restaurant.slug).toBe('spice-house');
    expect(txMock.restaurantMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: RestaurantRole.OWNER }),
      })
    );
    expect(txMock.taxRule.createMany).toHaveBeenCalled();
    expect(txMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'RESTAURANT_CREATED' }),
      })
    );
  });
});
