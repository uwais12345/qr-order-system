import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import {
  GuestSessionStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PlatformRole,
  RestaurantRole,
  RestaurantStatus,
  SubscriptionStatus,
  TableStatus,
} from '@prisma/client';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { prisma } from '../../src/config/prisma.js';
import { generateAccessToken } from '../../src/utils/jwt.js';
import { hashGuestToken } from '../../src/utils/token.js';
import { RazorpayGatewayAdapter } from '../../src/modules/payment/paymentProvider.js';
import { realtimeEmitter } from '../../src/realtime/realtimeEmitter.js';

vi.mock('../../src/config/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    restaurant: { findFirst: vi.fn() },
    guestSession: { findUnique: vi.fn() },
    customerOrder: { findFirst: vi.fn() },
    payment: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      groupBy: vi.fn(),
    },
    paymentWebhookEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
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
    emitPaymentUpdated: vi.fn(),
  },
}));

function signCheckout(orderId: string, paymentId: string): string {
  return crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

function signWebhook(rawPayload: string): string {
  return crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(Buffer.from(rawPayload, 'utf8'))
    .digest('hex');
}

describe('Payment Provider Adapter (HMAC Crypto)', () => {
  const adapter = new RazorpayGatewayAdapter();

  it('verifies valid Razorpay checkout and webhook signatures and rejects tampered payloads', () => {
    const rzpOrderId = 'order_Rzp123';
    const rzpPaymentId = 'pay_Rzp456';
    const sig = signCheckout(rzpOrderId, rzpPaymentId);

    expect(
      adapter.verifyCheckoutSignature({
        providerOrderId: rzpOrderId,
        providerPaymentId: rzpPaymentId,
        signature: sig,
      })
    ).toBe(true);

    expect(
      adapter.verifyCheckoutSignature({
        providerOrderId: rzpOrderId,
        providerPaymentId: 'pay_TAMPERED',
        signature: sig,
      })
    ).toBe(false);

    const rawBody = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1' } } } });
    const webhookSig = signWebhook(rawBody);

    expect(adapter.verifyWebhookSignature(Buffer.from(rawBody, 'utf8'), webhookSig)).toBe(true);
    expect(adapter.verifyWebhookSignature(Buffer.from(rawBody + ' ', 'utf8'), webhookSig)).toBe(false);
  });
});

describe('Payments, Webhooks & Cashier Settlement API', () => {
  const app = createApp();

  const rawGuestToken = 'guest-pay-token-123';
  const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const rstId = '11111111-1111-4111-8111-111111111111';
  const branchId = '22222222-2222-4222-8222-222222222222';
  const tableId = '33333333-3333-4333-8333-333333333333';
  const orderId = '44444444-4444-4444-8444-444444444444';
  const paymentId = '55555555-5555-4555-8555-555555555555';

  const ownerToken = generateAccessToken({
    userId: 'owner-1',
    email: 'owner@abc.in',
    platformRole: PlatformRole.RESTAURANT_USER,
  });

  const kitchenToken = generateAccessToken({
    userId: 'kitchen-1',
    email: 'kitchen@abc.in',
    platformRole: PlatformRole.RESTAURANT_USER,
  });

  const restaurantRecord = {
    id: rstId,
    tenantId: 'tenant-1',
    name: 'ABC Restaurant',
    slug: 'abc-restaurant',
    logoUrl: null,
    status: RestaurantStatus.ACTIVE,
    payAtRestaurantEnabled: true,
    subscriptions: [
      {
        id: 'sub-1',
        status: SubscriptionStatus.ACTIVE,
        endsAt: new Date(Date.now() + 86400_000),
      },
    ],
  };

  const activeGuestSession = {
    id: sessionId,
    qrTokenId: 'qr-1',
    diningTableId: tableId,
    accessTokenHash: hashGuestToken(rawGuestToken),
    customerName: 'Aarav',
    customerPhone: '9845022190',
    status: GuestSessionStatus.ACTIVE,
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 86400_000),
    diningTable: {
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
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses existing Razorpay order idempotently on repeated create-order requests', async () => {
    (prisma.guestSession.findUnique as any).mockResolvedValue(activeGuestSession);
    (prisma.customerOrder.findFirst as any).mockResolvedValue({
      id: orderId,
      orderNumber: 'SQ-1006',
      restaurantId: rstId,
      status: OrderStatus.PENDING,
      grandTotal: '672.00',
      payments: [
        {
          id: paymentId,
          provider: 'RAZORPAY',
          method: PaymentMethod.ONLINE,
          status: PaymentStatus.PENDING,
          amount: '672.00',
          currency: 'INR',
          providerOrderRef: 'order_RzpExisting99',
        },
      ],
    });

    const res = await request(app)
      .post('/api/v1/guest/payments/create-order')
      .set('x-guest-token', rawGuestToken)
      .send({ orderId });

    expect(res.status).toBe(201);
    expect(res.body.data.providerOrderId).toBe('order_RzpExisting99');
    expect(res.body.data.amountPaise).toBe(67200);
  });

  it('rejects client payment verification with spoofed signature and confirms valid HMAC signature', async () => {
    const rzpOrderId = 'order_RzpCheck1';
    const rzpPaymentId = 'pay_RzpCheck1';

    (prisma.guestSession.findUnique as any).mockResolvedValue(activeGuestSession);
    (prisma.customerOrder.findFirst as any).mockResolvedValue({
      id: orderId,
      orderNumber: 'SQ-1006',
      restaurantId: rstId,
      branchId,
      diningTableId: tableId,
      guestSessionId: sessionId,
      status: OrderStatus.PENDING,
      estimatedPrepMinutes: 15,
      payments: [
        {
          id: paymentId,
          method: PaymentMethod.ONLINE,
          status: PaymentStatus.PENDING,
          amount: '672.00',
          providerOrderRef: rzpOrderId,
        },
      ],
    });

    // 1. Spoofed signature rejected (FR-PAY-05)
    const badRes = await request(app)
      .post('/api/v1/guest/payments/verify')
      .set('x-guest-token', rawGuestToken)
      .send({
        orderId,
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: '0'.repeat(64),
      });

    expect(badRes.status).toBe(400);
    expect(prisma.payment.update).not.toHaveBeenCalled();

    // 2. Valid HMAC signature confirms payment and emits payment:updated
    (prisma.guestSession.findUnique as any).mockResolvedValue(activeGuestSession);
    (prisma.customerOrder.findFirst as any).mockResolvedValue({
      id: orderId,
      orderNumber: 'SQ-1006',
      restaurantId: rstId,
      branchId,
      diningTableId: tableId,
      guestSessionId: sessionId,
      status: OrderStatus.PENDING,
      estimatedPrepMinutes: 15,
      payments: [
        {
          id: paymentId,
          method: PaymentMethod.ONLINE,
          status: PaymentStatus.PENDING,
          amount: '672.00',
          providerOrderRef: rzpOrderId,
        },
      ],
    });
    const verifiedAt = new Date();
    (prisma.payment.update as any).mockResolvedValue({
      id: paymentId,
      method: PaymentMethod.ONLINE,
      status: PaymentStatus.SUCCEEDED,
      amount: '672.00',
      verifiedAt,
    });

    const okRes = await request(app)
      .post('/api/v1/guest/payments/verify')
      .set('x-guest-token', rawGuestToken)
      .send({
        orderId,
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: signCheckout(rzpOrderId, rzpPaymentId),
      });

    expect(okRes.status).toBe(200);
    expect(okRes.body.data.verified).toBe(true);
    expect(okRes.body.data.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(realtimeEmitter.emitPaymentUpdated).toHaveBeenCalled();
  });

  it('rejects invalid webhook signatures and processes duplicate payment.captured webhooks idempotently', async () => {
    const payloadStr = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_Hook1',
            order_id: 'order_Hook1',
            amount: 67200,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });

    // 1. Invalid webhook signature -> 400
    const badRes = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'bad_signature_hex')
      .send(payloadStr);

    expect(badRes.status).toBe(400);

    // 2. First delivery -> updates Payment to SUCCEEDED and emits real-time event
    const validSig = signWebhook(payloadStr);
    const now = new Date();
    const txFirstMock = {
      paymentWebhookEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'wh-1' }),
        update: vi.fn().mockResolvedValue({ id: 'wh-1', processedAt: now }),
      },
      payment: {
        findFirst: vi.fn().mockResolvedValue({
          id: paymentId,
          status: PaymentStatus.PENDING,
          method: PaymentMethod.ONLINE,
          amount: '672.00',
          providerOrderRef: 'order_Hook1',
          order: {
            id: orderId,
            orderNumber: 'SQ-1006',
            restaurantId: rstId,
            branchId,
            diningTableId: tableId,
            guestSessionId: sessionId,
            status: OrderStatus.ACCEPTED,
            estimatedPrepMinutes: 15,
          },
        }),
        update: vi.fn().mockResolvedValue({
          id: paymentId,
          method: PaymentMethod.ONLINE,
          status: PaymentStatus.SUCCEEDED,
          amount: '672.00',
          verifiedAt: now,
        }),
      },
    };
    (prisma.$transaction as any).mockImplementationOnce(async (cb: any) => cb(txFirstMock));

    const firstRes = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', validSig)
      .set('x-razorpay-event-id', 'evt_rzp_001')
      .send(payloadStr);

    expect(firstRes.status).toBe(200);
    expect(firstRes.body.data.duplicate).toBe(false);
    expect(firstRes.body.data.paymentStatus).toBe(PaymentStatus.SUCCEEDED);
    expect(realtimeEmitter.emitPaymentUpdated).toHaveBeenCalledTimes(1);

    // 3. Duplicate delivery -> returns 200 duplicate: true without updating Payment again
    const txDuplicateMock = {
      paymentWebhookEvent: {
        findUnique: vi.fn().mockResolvedValue({ id: 'wh-1', processedAt: now }),
      },
      payment: { update: vi.fn() },
    };
    (prisma.$transaction as any).mockImplementationOnce(async (cb: any) => cb(txDuplicateMock));

    const dupRes = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', validSig)
      .set('x-razorpay-event-id', 'evt_rzp_001')
      .send(payloadStr);

    expect(dupRes.status).toBe(200);
    expect(dupRes.body.data.duplicate).toBe(true);
    expect(txDuplicateMock.payment.update).not.toHaveBeenCalled();
    expect(realtimeEmitter.emitPaymentUpdated).toHaveBeenCalledTimes(1);
  });

  it('restricts revenue summary & offline settlement to OWNER and counts only SUCCEEDED revenue (FR-REP-02)', async () => {
    // 1. Kitchen staff blocked from revenue summary -> 403
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: 'kitchen-1',
      email: 'kitchen@abc.in',
      displayName: 'Chef',
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
    (prisma.restaurant.findFirst as any).mockResolvedValueOnce(restaurantRecord);

    const forbiddenRes = await request(app)
      .get(`/api/v1/restaurants/${rstId}/payments/summary`)
      .set('Authorization', `Bearer ${kitchenToken}`);

    expect(forbiddenRes.status).toBe(403);

    // 2. Owner gets verified revenue summary (excluding FAILED/PENDING)
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: 'owner-1',
      email: 'owner@abc.in',
      displayName: 'Rahul',
      platformRole: PlatformRole.RESTAURANT_USER,
      status: 'ACTIVE',
      memberships: [
        {
          id: 'mem-o',
          restaurantId: rstId,
          role: RestaurantRole.OWNER,
          status: 'ACTIVE',
          restaurant: restaurantRecord,
        },
      ],
    });
    (prisma.restaurant.findFirst as any).mockResolvedValueOnce(restaurantRecord);
    (prisma.payment.groupBy as any)
      .mockResolvedValueOnce([
        { method: PaymentMethod.ONLINE, _sum: { amount: '1200.00' }, _count: { id: 2 } },
        { method: PaymentMethod.PAY_AT_RESTAURANT, _sum: { amount: '500.00' }, _count: { id: 1 } },
      ])
      .mockResolvedValueOnce([
        { status: PaymentStatus.SUCCEEDED, _sum: { amount: '1700.00' }, _count: { id: 3 } },
        { status: PaymentStatus.FAILED, _sum: { amount: '900.00' }, _count: { id: 1 } },
      ]);

    const summaryRes = await request(app)
      .get(`/api/v1/restaurants/${rstId}/payments/summary`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.verifiedRevenueTotal).toBe('1700.00');
    expect(summaryRes.body.data.verifiedByMethod).toHaveLength(2);
  });
});
