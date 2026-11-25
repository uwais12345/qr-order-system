import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { OrderStatus, PlatformRole, RestaurantRole, SubscriptionStatus } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';
import { generateAccessToken } from '../../src/utils/jwt.js';
import { realtimeEmitter } from '../../src/realtime/realtimeEmitter.js';

vi.mock('../../src/config/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    restaurant: { findFirst: vi.fn() },
    customerOrder: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    orderStatusHistory: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock('../../src/realtime/realtimeEmitter.js', () => ({
  initRealtime: vi.fn(),
  getRealtimeIO: vi.fn(),
  realtimeEmitter: {
    emitOrderCreated: vi.fn(),
    emitOrderStatusUpdated: vi.fn(),
    emitOrderEstimateUpdated: vi.fn(),
  },
}));

describe('Kitchen (KDS) & Staff Orders API', () => {
  const app = createApp();
  const rstAId = '11111111-1111-4111-8111-111111111111';
  const rstBId = '22222222-2222-4222-8222-222222222222';
  const branchId = '33333333-3333-4333-8333-333333333333';
  const tableId = '44444444-4444-4444-8444-444444444444';
  const guestSessionId = '55555555-5555-4555-8555-555555555555';
  const orderId = '66666666-6666-4666-8666-666666666666';

  const kitchenToken = generateAccessToken({
    userId: 'kitchen-a',
    email: 'kitchen@a.in',
    platformRole: PlatformRole.RESTAURANT_USER,
  });

  const restaurantA = {
    id: rstAId,
    tenantId: 'tenant-a',
    name: 'Restaurant A',
    slug: 'restaurant-a',
    status: 'ACTIVE',
    subscriptions: [{ id: 'sub-a', status: SubscriptionStatus.ACTIVE, endsAt: null }],
  };

  function mockKitchenUser() {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'kitchen-a',
      email: 'kitchen@a.in',
      displayName: 'Chef Raj',
      platformRole: PlatformRole.RESTAURANT_USER,
      status: 'ACTIVE',
      memberships: [
        {
          id: 'mem-ka',
          restaurantId: rstAId,
          role: RestaurantRole.KITCHEN,
          status: 'ACTIVE',
          restaurant: restaurantA,
        },
      ],
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks Kitchen staff from accessing another restaurant KDS queue (NFR-02)', async () => {
    mockKitchenUser();
    (prisma.restaurant.findFirst as any).mockResolvedValue({
      id: rstBId,
      tenantId: 'tenant-b',
      name: 'Restaurant B',
      slug: 'restaurant-b',
      status: 'ACTIVE',
      subscriptions: [{ id: 'sub-b', status: SubscriptionStatus.ACTIVE, endsAt: null }],
    });

    const res = await request(app)
      .get(`/api/v1/restaurants/${rstBId}/orders?activeOnly=true`)
      .set('Authorization', `Bearer ${kitchenToken}`);

    expect(res.status).toBe(403);
  });

  it('transitions order status PENDING -> ACCEPTED, records history, and emits Socket.IO event after commit', async () => {
    mockKitchenUser();
    (prisma.restaurant.findFirst as any).mockResolvedValue(restaurantA);
    (prisma.customerOrder.findFirst as any).mockResolvedValue({
      id: orderId,
      orderNumber: 'SQ-1006',
      restaurantId: rstAId,
      branchId,
      diningTableId: tableId,
      guestSessionId,
      status: OrderStatus.PENDING,
    });

    const now = new Date();
    const updatedOrderRecord = {
      id: orderId,
      orderNumber: 'SQ-1006',
      restaurantId: rstAId,
      branchId,
      diningTableId: tableId,
      guestSessionId,
      status: OrderStatus.ACCEPTED,
      customerName: 'Aarav',
      customerPhone: '9845022190',
      subtotal: '640.00',
      taxTotal: '32.00',
      discountTotal: '0.00',
      grandTotal: '672.00',
      estimatedPrepMinutes: 20,
      estimateUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
      branch: { id: branchId, name: 'Main Branch' },
      diningTable: { id: tableId, tableCode: 'T01', displayName: 'Table T01' },
      items: [],
      taxLines: [],
      payments: [],
      statusHistory: [
        { id: 'h1', fromStatus: null, toStatus: OrderStatus.PENDING },
        { id: 'h2', fromStatus: OrderStatus.PENDING, toStatus: OrderStatus.ACCEPTED },
      ],
    };

    const txMock = {
      customerOrder: {
        update: vi.fn().mockResolvedValue(updatedOrderRecord),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updatedOrderRecord),
      },
      orderStatusHistory: { create: vi.fn().mockResolvedValue({ id: 'h2' }) },
      auditLog: { create: vi.fn() },
    };
    (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(txMock));

    const res = await request(app)
      .patch(`/api/v1/restaurants/${rstAId}/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ toStatus: OrderStatus.ACCEPTED, estimatedPrepMinutes: 20 });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(OrderStatus.ACCEPTED);
    expect(res.body.data.customerStage).toEqual({ label: 'Order Accepted', stepIndex: 1 });
    expect(txMock.orderStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId,
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.ACCEPTED,
          changedByUserId: 'kitchen-a',
        }),
      })
    );
    expect(realtimeEmitter.emitOrderStatusUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: orderId, status: OrderStatus.ACCEPTED }),
      expect.objectContaining({ fromStatus: OrderStatus.PENDING, toStatus: OrderStatus.ACCEPTED })
    );
  });

  it('rejects invalid status jump PENDING -> READY and does not emit real-time events', async () => {
    mockKitchenUser();
    (prisma.restaurant.findFirst as any).mockResolvedValue(restaurantA);
    (prisma.customerOrder.findFirst as any).mockResolvedValue({
      id: orderId,
      orderNumber: 'SQ-1006',
      restaurantId: rstAId,
      status: OrderStatus.PENDING,
    });

    const res = await request(app)
      .patch(`/api/v1/restaurants/${rstAId}/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ toStatus: OrderStatus.READY });

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(realtimeEmitter.emitOrderStatusUpdated).not.toHaveBeenCalled();
  });

  it('updates prep time estimate on active order and broadcasts estimate event', async () => {
    mockKitchenUser();
    (prisma.restaurant.findFirst as any).mockResolvedValue(restaurantA);
    (prisma.customerOrder.findFirst as any).mockResolvedValue({
      id: orderId,
      orderNumber: 'SQ-1006',
      restaurantId: rstAId,
      status: OrderStatus.PREPARING,
      estimatedPrepMinutes: 15,
    });

    const now = new Date();
    const txMock = {
      customerOrder: {
        update: vi.fn().mockResolvedValue({
          id: orderId,
          orderNumber: 'SQ-1006',
          restaurantId: rstAId,
          branchId,
          diningTableId: tableId,
          guestSessionId,
          status: OrderStatus.PREPARING,
          customerName: 'Aarav',
          customerPhone: '9845022190',
          subtotal: '640.00',
          taxTotal: '32.00',
          discountTotal: '0.00',
          grandTotal: '672.00',
          estimatedPrepMinutes: 25,
          estimateUpdatedAt: now,
          createdAt: now,
          updatedAt: now,
          items: [],
          taxLines: [],
          payments: [],
          statusHistory: [],
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'a1' }) },
    };
    (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(txMock));

    const res = await request(app)
      .patch(`/api/v1/restaurants/${rstAId}/orders/${orderId}/estimate`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ estimatedPrepMinutes: 25 });

    expect(res.status).toBe(200);
    expect(res.body.data.estimatedPrepMinutes).toBe(25);
    expect(realtimeEmitter.emitOrderEstimateUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: orderId, estimatedPrepMinutes: 25 })
    );
  });
});
