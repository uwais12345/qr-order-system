import http from 'http';
import crypto from 'crypto';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import {
  CartStatus,
  GuestSessionStatus,
  ItemAvailability,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PlatformRole,
  RestaurantRole,
  RestaurantStatus,
  SubscriptionStatus,
  TableStatus,
  TaxCalculationType,
} from '@prisma/client';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { prisma } from '../../src/config/prisma.js';
import { initRealtime } from '../../src/realtime/realtimeEmitter.js';
import { generateAccessToken } from '../../src/utils/jwt.js';
import { hashGuestToken, hashQrToken } from '../../src/utils/token.js';

vi.mock('../../src/config/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    restaurant: { findFirst: vi.fn(), findUnique: vi.fn() },
    qRToken: { findUnique: vi.fn() },
    guestSession: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    cart: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    cartItem: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    menuCategory: { findMany: vi.fn() },
    menuItem: { findFirst: vi.fn() },
    taxRule: { findMany: vi.fn() },
    customerOrder: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    orderStatusHistory: { create: vi.fn() },
    payment: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

describe('E2E Acceptance: QR Scan -> Cart -> Order -> Socket.IO KDS -> Razorpay Verify', () => {
  let httpServer: http.Server;
  let ioServer: ReturnType<typeof initRealtime>;
  let baseUrl: string;
  let kitchenSocket: ClientSocket;
  let guestSocket: ClientSocket;

  const rstId = '11111111-1111-4111-8111-111111111111';
  const branchId = '22222222-2222-4222-8222-222222222222';
  const tableId = '33333333-3333-4333-8333-333333333333';
  const sessionId = '44444444-4444-4444-8444-444444444444';
  const cartId = '55555555-5555-4555-8555-555555555555';
  const menuItemId = '66666666-6666-4666-8666-666666666666';
  const orderId = '77777777-7777-4777-8777-777777777777';
  const paymentId = '88888888-8888-4888-8888-888888888888';

  const rawQrToken = 'e2e-table-t01-qr-secret';
  const kitchenJwt = generateAccessToken({
    userId: 'kitchen-e2e',
    email: 'kitchen@abc.in',
    platformRole: PlatformRole.RESTAURANT_USER,
  });

  const restaurantRecord = {
    id: rstId,
    tenantId: 'tenant-e2e',
    name: 'ABC Restaurant',
    slug: 'abc-restaurant',
    logoUrl: null,
    status: RestaurantStatus.ACTIVE,
    payAtRestaurantEnabled: false,
    subscriptions: [
      {
        id: 'sub-1',
        status: SubscriptionStatus.ACTIVE,
        endsAt: new Date(Date.now() + 86400_000),
      },
    ],
  };

  beforeAll(async () => {
    const app = createApp();
    httpServer = http.createServer(app);
    ioServer = initRealtime(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = httpServer.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    kitchenSocket?.disconnect();
    guestSocket?.disconnect();
    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes full real-time ordering, KDS progression, and cryptographic payment verification over HTTP + WebSocket', async () => {
    const now = new Date();
    const diningTable = {
      id: tableId,
      tableCode: 'T01',
      displayName: 'Table T01',
      status: TableStatus.ACTIVE,
      branch: {
        id: branchId,
        name: 'Main Branch',
        status: 'ACTIVE',
        restaurant: restaurantRecord,
      },
    };

    // 1. Kitchen Staff connects via Socket.IO JWT handshake
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'kitchen-e2e',
      email: 'kitchen@abc.in',
      displayName: 'Chef E2E',
      platformRole: PlatformRole.RESTAURANT_USER,
      status: 'ACTIVE',
      memberships: [
        {
          id: 'mem-k',
          restaurantId: rstId,
          role: RestaurantRole.KITCHEN,
          status: 'ACTIVE',
          restaurant: restaurantRecord,
        },
      ],
    });

    kitchenSocket = ioc(baseUrl, {
      auth: { token: kitchenJwt },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve, reject) => {
      kitchenSocket.on('connect', () => resolve());
      kitchenSocket.on('connect_error', reject);
    });

    // 2. Guest scans QR token -> creates GuestSession
    (prisma.qRToken.findUnique as any).mockResolvedValueOnce({
      id: 'qr-e2e',
      tokenHash: hashQrToken(rawQrToken),
      status: 'ACTIVE',
      revokedAt: null,
      expiresAt: null,
      diningTable,
    });
    (prisma.$transaction as any).mockImplementationOnce(async (cb: any) =>
      cb({
        guestSession: {
          create: vi.fn().mockResolvedValue({
            id: sessionId,
            expiresAt: new Date(now.getTime() + 12 * 3600_000),
          }),
        },
        cart: { create: vi.fn().mockResolvedValue({ id: cartId }) },
      })
    );

    const sessionRes = await request(baseUrl)
      .post('/api/v1/guest/sessions')
      .send({ token: rawQrToken, restaurantSlug: 'abc-restaurant', tableCode: 'T01' });

    expect(sessionRes.status).toBe(201);
    const guestAccessToken = sessionRes.body.data.accessToken as string;

    const guestSessionRecord = {
      id: sessionId,
      qrTokenId: 'qr-e2e',
      diningTableId: tableId,
      accessTokenHash: hashGuestToken(guestAccessToken),
      customerName: null,
      customerPhone: null,
      status: GuestSessionStatus.ACTIVE,
      startedAt: now,
      expiresAt: new Date(now.getTime() + 12 * 3600_000),
      diningTable,
    };

    // Guest connects via Socket.IO capability token
    (prisma.guestSession.findUnique as any).mockResolvedValue(guestSessionRecord);
    guestSocket = ioc(baseUrl, {
      auth: { guestToken: guestAccessToken },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve, reject) => {
      guestSocket.on('connect', () => resolve());
      guestSocket.on('connect_error', reject);
    });

    // 3. Guest places atomic order & Kitchen receives real-time 'order:created' event
    const kitchenOrderCreatedPromise = new Promise<any>((resolve) => {
      kitchenSocket.once('order:created', resolve);
    });

    (prisma.payment.findUnique as any).mockResolvedValueOnce(null);
    const cartWithBiryani = {
      id: cartId,
      status: CartStatus.ACTIVE,
      items: [
        {
          id: 'ci-1',
          quantity: 1,
          unitPriceAtAdd: '320.00',
          menuItem: {
            id: menuItemId,
            name: 'Royal Dum Biryani',
            price: '320.00',
            availabilityStatus: ItemAvailability.AVAILABLE,
            category: { isActive: true, restaurantId: rstId },
            modifierGroups: [],
          },
          selectedModifiers: [],
        },
      ],
    };

    const createdOrderRecord = {
      id: orderId,
      orderNumber: 'SQ-1001',
      restaurantId: rstId,
      branchId,
      diningTableId: tableId,
      guestSessionId: sessionId,
      status: OrderStatus.PENDING,
      customerName: 'Aarav',
      customerPhone: '9845022190',
      subtotal: '320.00',
      taxTotal: '16.00',
      discountTotal: '0.00',
      grandTotal: '336.00',
      estimatedPrepMinutes: 15,
      createdAt: now,
      updatedAt: now,
      restaurant: restaurantRecord,
      branch: diningTable.branch,
      diningTable,
      items: [
        {
          id: 'oi-1',
          menuItemId,
          itemNameSnapshot: 'Royal Dum Biryani',
          quantity: 1,
          unitPrice: '320.00',
          lineTotal: '320.00',
          modifiers: [],
        },
      ],
      taxLines: [
        {
          id: 'otl-1',
          taxNameSnapshot: 'GST',
          rateSnapshot: '5.00',
          taxableAmount: '320.00',
          taxAmount: '16.00',
        },
      ],
      payments: [
        {
          id: paymentId,
          provider: 'RAZORPAY',
          method: PaymentMethod.ONLINE,
          status: PaymentStatus.INITIATED,
          amount: '336.00',
          currency: 'INR',
          providerOrderRef: 'order_E2E_1',
          verifiedAt: null,
        },
      ],
      statusHistory: [{ id: 'h1', fromStatus: null, toStatus: OrderStatus.PENDING }],
    };

    (prisma.$transaction as any).mockImplementationOnce(async (cb: any) =>
      cb({
        restaurant: { findUnique: vi.fn().mockResolvedValue(restaurantRecord) },
        cart: {
          findFirst: vi.fn().mockResolvedValue(cartWithBiryani),
          update: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({}),
        },
        taxRule: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'tax-gst',
              name: 'GST',
              rate: '5.00',
              calculationType: TaxCalculationType.PERCENTAGE,
              isActive: true,
              effectiveFrom: new Date(now.getTime() - 10_000),
              effectiveTo: null,
            },
          ]),
        },
        customerOrder: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(createdOrderRecord),
        },
        guestSession: { update: vi.fn().mockResolvedValue({}) },
      })
    );

    const checkoutRes = await request(baseUrl)
      .post('/api/v1/guest/orders')
      .set('x-guest-token', guestAccessToken)
      .send({
        customerName: 'Aarav',
        customerPhone: '9845022190',
        paymentMethod: PaymentMethod.ONLINE,
        idempotencyKey: 'e2e-order-idem-1',
      });

    expect(checkoutRes.status).toBe(201);
    expect(checkoutRes.body.data.order.orderNumber).toBe('SQ-1001');

    const kitchenEvent = await kitchenOrderCreatedPromise;
    expect(kitchenEvent.eventType).toBe('order:created');
    expect(kitchenEvent.resource.id).toBe(orderId);

    // 4. Guest verifies Razorpay payment & receives real-time 'payment:updated'
    const guestPaymentPromise = new Promise<any>((resolve) => {
      guestSocket.once('payment:updated', resolve);
    });

    const rzpOrderId = 'order_E2E_1';
    const rzpPaymentId = 'pay_E2E_1';
    const validSig = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${rzpOrderId}|${rzpPaymentId}`)
      .digest('hex');

    (prisma.customerOrder.findFirst as any).mockResolvedValueOnce({
      ...createdOrderRecord,
      payments: [{ id: paymentId, method: PaymentMethod.ONLINE, status: PaymentStatus.PENDING, amount: '336.00', providerOrderRef: rzpOrderId }],
    });
    (prisma.payment.update as any).mockResolvedValueOnce({
      id: paymentId,
      method: PaymentMethod.ONLINE,
      status: PaymentStatus.SUCCEEDED,
      amount: '336.00',
      verifiedAt: now,
    });

    const payVerifyRes = await request(baseUrl)
      .post('/api/v1/guest/payments/verify')
      .set('x-guest-token', guestAccessToken)
      .send({
        orderId,
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: validSig,
      });

    expect(payVerifyRes.status).toBe(200);
    expect(payVerifyRes.body.data.payment.status).toBe(PaymentStatus.SUCCEEDED);

    const payEvent = await guestPaymentPromise;
    expect(payEvent.eventType).toBe('payment:updated');
    expect(payEvent.payload.status).toBe(PaymentStatus.SUCCEEDED);

    // 5. Kitchen accepts order -> Guest receives real-time 'order:status_updated'
    const guestStatusPromise = new Promise<any>((resolve) => {
      guestSocket.once('order:status_updated', resolve);
    });

    (prisma.restaurant.findFirst as any).mockResolvedValueOnce(restaurantRecord);
    (prisma.customerOrder.findFirst as any).mockResolvedValueOnce(createdOrderRecord);
    const acceptedOrderRecord = {
      ...createdOrderRecord,
      status: OrderStatus.ACCEPTED,
      estimatedPrepMinutes: 18,
    };
    (prisma.$transaction as any).mockImplementationOnce(async (cb: any) =>
      cb({
        customerOrder: {
          update: vi.fn().mockResolvedValue(acceptedOrderRecord),
          findUniqueOrThrow: vi.fn().mockResolvedValue(acceptedOrderRecord),
        },
        orderStatusHistory: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn() },
      })
    );

    const kdsRes = await request(baseUrl)
      .patch(`/api/v1/restaurants/${rstId}/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${kitchenJwt}`)
      .send({ toStatus: OrderStatus.ACCEPTED, estimatedPrepMinutes: 18 });

    expect(kdsRes.status).toBe(200);
    expect(kdsRes.body.data.customerStage).toEqual({ label: 'Order Accepted', stepIndex: 1 });

    const statusEvent = await guestStatusPromise;
    expect(statusEvent.eventType).toBe('order:status_updated');
    expect(statusEvent.payload.toStatus).toBe(OrderStatus.ACCEPTED);
    expect(statusEvent.payload.customerStage).toEqual({ label: 'Order Accepted', stepIndex: 1 });
  });
});
