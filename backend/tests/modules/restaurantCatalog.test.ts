import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { ItemAvailability, PlatformRole, RestaurantRole, SubscriptionStatus } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';
import { generateAccessToken } from '../../src/utils/jwt.js';

vi.mock('../../src/config/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    restaurant: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    branch: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    restaurantSubscription: { findFirst: vi.fn() },
    diningTable: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    qRToken: { updateMany: vi.fn(), create: vi.fn() },
    menuCategory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    menuItem: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    modifierGroup: { findMany: vi.fn(), count: vi.fn() },
    taxRule: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

describe('Restaurant Catalog, Tables & QR API', () => {
  const app = createApp();

  const rstAId = '11111111-1111-4111-8111-111111111111';
  const rstBId = '22222222-2222-4222-8222-222222222222';
  const branchAId = '33333333-3333-4333-8333-333333333333';
  const tableAId = '44444444-4444-4444-8444-444444444444';
  const catOldId = '55555555-5555-4555-8555-555555555555';
  const catNewId = '66666666-6666-4666-8666-666666666666';
  const itemAId = '77777777-7777-4777-8777-777777777777';

  const ownerAToken = generateAccessToken({
    userId: 'owner-a',
    email: 'owner@a.in',
    platformRole: PlatformRole.RESTAURANT_USER,
  });

  const kitchenAToken = generateAccessToken({
    userId: 'kitchen-a',
    email: 'kitchen@a.in',
    platformRole: PlatformRole.RESTAURANT_USER,
  });

  const restaurantARecord = {
    id: rstAId,
    tenantId: 'tenant-a',
    name: 'Restaurant A',
    slug: 'restaurant-a',
    status: 'ACTIVE',
    subscriptions: [{ id: 'sub-a', status: SubscriptionStatus.ACTIVE, endsAt: null }],
  };

  function mockUser(role: RestaurantRole) {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: role === RestaurantRole.OWNER ? 'owner-a' : 'kitchen-a',
      email: role === RestaurantRole.OWNER ? 'owner@a.in' : 'kitchen@a.in',
      displayName: 'Staff User',
      platformRole: PlatformRole.RESTAURANT_USER,
      status: 'ACTIVE',
      memberships: [
        {
          id: 'mem-a',
          restaurantId: rstAId,
          role,
          status: 'ACTIVE',
          restaurant: restaurantARecord,
        },
      ],
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enforces multi-tenant isolation: Restaurant A owner cannot access Restaurant B tables', async () => {
    mockUser(RestaurantRole.OWNER);
    (prisma.restaurant.findFirst as any).mockResolvedValue({
      id: rstBId,
      tenantId: 'tenant-b',
      name: 'Restaurant B',
      slug: 'restaurant-b',
      status: 'ACTIVE',
      subscriptions: [{ id: 'sub-b', status: SubscriptionStatus.ACTIVE, endsAt: null }],
    });

    const res = await request(app)
      .get(`/api/v1/restaurants/${rstBId}/tables`)
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('creates dining table and returns raw QR token once while storing only hash', async () => {
    mockUser(RestaurantRole.OWNER);
    (prisma.restaurant.findFirst as any).mockResolvedValue(restaurantARecord);
    (prisma.branch.findFirst as any).mockResolvedValue({
      id: branchAId,
      restaurantId: rstAId,
      restaurant: { slug: 'restaurant-a' },
    });
    (prisma.diningTable.findUnique as any).mockResolvedValue(null);
    (prisma.diningTable.count as any).mockResolvedValue(2);
    (prisma.restaurantSubscription.findFirst as any).mockResolvedValue({
      plan: { featureConfig: { maxTables: 20 } },
    });

    let storedTokenHash = '';
    const txMock = {
      diningTable: {
        create: vi.fn().mockResolvedValue({
          id: tableAId,
          branchId: branchAId,
          tableCode: 'T03',
          displayName: 'Table T03',
          capacity: 4,
        }),
      },
      qRToken: {
        create: vi.fn().mockImplementation(async (args: any) => {
          storedTokenHash = args.data.tokenHash;
          return {
            id: 'qr-1',
            status: 'ACTIVE',
            createdAt: new Date(),
            expiresAt: null,
          };
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(txMock));

    const res = await request(app)
      .post(`/api/v1/restaurants/${rstAId}/tables`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        branchId: branchAId,
        tableCode: 't03',
        displayName: 'Table T03',
        capacity: 4,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.table.tableCode).toBe('T03');
    expect(res.body.data.qrCredentials.rawToken).toBeDefined();
    expect(res.body.data.qrCredentials.qrPath).toContain('/menu/restaurant-a?table=T03');
    expect(storedTokenHash).toHaveLength(64); // SHA-256 hex digest
    expect(storedTokenHash).not.toBe(res.body.data.qrCredentials.rawToken);
  });

  it('blocks deleting a non-empty category without reassignment and supports atomic reassignment', async () => {
    mockUser(RestaurantRole.OWNER);
    (prisma.restaurant.findFirst as any).mockResolvedValue(restaurantARecord);
    (prisma.menuCategory.findFirst as any).mockResolvedValue({
      id: catOldId,
      restaurantId: rstAId,
      name: 'Old Starters',
      _count: { items: 3 },
    });

    // 1. Without reassignToCategoryId -> 400
    const badRes = await request(app)
      .delete(`/api/v1/restaurants/${rstAId}/menu/categories/${catOldId}`)
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(badRes.status).toBe(400);

    // 2. With reassignToCategoryId -> 200 and items moved
    mockUser(RestaurantRole.OWNER);
    (prisma.restaurant.findFirst as any).mockResolvedValue(restaurantARecord);
    (prisma.menuCategory.findFirst as any)
      .mockResolvedValueOnce({
        id: catOldId,
        restaurantId: rstAId,
        name: 'Old Starters',
        _count: { items: 3 },
      })
      .mockResolvedValueOnce({
        id: catNewId,
        restaurantId: rstAId,
        name: 'Appetizers',
      });

    const txMock = {
      menuItem: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
      menuCategory: { delete: vi.fn().mockResolvedValue({ id: catOldId }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-2' }) },
    };
    (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(txMock));

    const okRes = await request(app)
      .delete(
        `/api/v1/restaurants/${rstAId}/menu/categories/${catOldId}?reassignToCategoryId=${catNewId}`
      )
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(okRes.status).toBe(200);
    expect(okRes.body.data.reassignedCount).toBe(3);
    expect(txMock.menuItem.updateMany).toHaveBeenCalledWith({
      where: { categoryId: catOldId },
      data: { categoryId: catNewId },
    });
  });

  it('rejects modifier group when maxSelect < minSelect', async () => {
    mockUser(RestaurantRole.OWNER);
    (prisma.restaurant.findFirst as any).mockResolvedValue(restaurantARecord);

    const res = await request(app)
      .post(`/api/v1/restaurants/${rstAId}/menu/modifier-groups`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        name: 'Toppings',
        minSelect: 3,
        maxSelect: 1,
        options: [{ name: 'Extra Cheese', priceDelta: 40 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Validation failed');
  });

  it('allows KITCHEN staff to mark item availability SOLD_OUT while blocking menu creation', async () => {
    // 1. Blocked from creating category -> 403
    mockUser(RestaurantRole.KITCHEN);
    (prisma.restaurant.findFirst as any).mockResolvedValue(restaurantARecord);

    const forbiddenRes = await request(app)
      .post(`/api/v1/restaurants/${rstAId}/menu/categories`)
      .set('Authorization', `Bearer ${kitchenAToken}`)
      .send({ name: 'Secrets' });

    expect(forbiddenRes.status).toBe(403);

    // 2. Allowed to toggle item availability -> 200
    mockUser(RestaurantRole.KITCHEN);
    (prisma.restaurant.findFirst as any).mockResolvedValue(restaurantARecord);
    (prisma.menuItem.findFirst as any).mockResolvedValue({
      id: itemAId,
      availabilityStatus: ItemAvailability.AVAILABLE,
    });
    const txMock = {
      menuItem: {
        update: vi.fn().mockResolvedValue({
          id: itemAId,
          availabilityStatus: ItemAvailability.SOLD_OUT,
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-3' }) },
    };
    (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(txMock));

    const okRes = await request(app)
      .patch(`/api/v1/restaurants/${rstAId}/menu/items/${itemAId}/availability`)
      .set('Authorization', `Bearer ${kitchenAToken}`)
      .send({ availabilityStatus: ItemAvailability.SOLD_OUT });

    expect(okRes.status).toBe(200);
    expect(okRes.body.data.availabilityStatus).toBe(ItemAvailability.SOLD_OUT);
  });

  it('prevents deleting a table with order history (409) and deletes unused tables with audit log', async () => {
    mockUser(RestaurantRole.OWNER);
    (prisma.restaurant.findFirst as any).mockResolvedValue(restaurantARecord);
    (prisma.diningTable.findFirst as any).mockResolvedValueOnce({
      id: tableAId,
      tableCode: 'T03',
      branchId: branchAId,
      _count: { orders: 2, guestSessions: 1 },
    });

    const conflictRes = await request(app)
      .delete(`/api/v1/restaurants/${rstAId}/tables/${tableAId}`)
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(conflictRes.status).toBe(409);

    mockUser(RestaurantRole.OWNER);
    (prisma.restaurant.findFirst as any).mockResolvedValue(restaurantARecord);
    (prisma.diningTable.findFirst as any).mockResolvedValueOnce({
      id: tableAId,
      tableCode: 'T03',
      branchId: branchAId,
      _count: { orders: 0, guestSessions: 0 },
    });

    const txMock = {
      diningTable: { delete: vi.fn().mockResolvedValue({ id: tableAId }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-del-tbl' }) },
    };
    (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(txMock));

    const okRes = await request(app)
      .delete(`/api/v1/restaurants/${rstAId}/tables/${tableAId}`)
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(okRes.status).toBe(200);
    expect(okRes.body.data.deletedTableId).toBe(tableAId);
    expect(txMock.diningTable.delete).toHaveBeenCalledWith({ where: { id: tableAId } });
  });

  it('accepts uploaded data:image logo URIs on restaurant profile updates and rejects unsafe schemes', async () => {
    mockUser(RestaurantRole.OWNER);
    (prisma.restaurant.findFirst as any).mockResolvedValue(restaurantARecord);

    const badRes = await request(app)
      .patch(`/api/v1/restaurants/${rstAId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ logoUrl: 'javascript:alert(1)' });

    expect(badRes.status).toBe(400);

    mockUser(RestaurantRole.OWNER);
    (prisma.restaurant.findFirst as any).mockResolvedValue(restaurantARecord);
    (prisma.restaurant.findUnique as any).mockResolvedValue(restaurantARecord);
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const txMock = {
      restaurant: {
        update: vi.fn().mockResolvedValue({ ...restaurantARecord, logoUrl: dataUri }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-logo' }) },
    };
    (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(txMock));

    const okRes = await request(app)
      .patch(`/api/v1/restaurants/${rstAId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ logoUrl: dataUri });

    expect(okRes.status).toBe(200);
    expect(okRes.body.data.logoUrl).toBe(dataUri);
  });
});
