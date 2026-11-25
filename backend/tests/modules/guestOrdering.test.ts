import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import {
  CartStatus,
  GuestSessionStatus,
  ItemAvailability,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RestaurantStatus,
  SubscriptionStatus,
  TableStatus,
  TaxCalculationType,
} from '@prisma/client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';
import { hashGuestToken } from '../../src/utils/token.js';

vi.mock('../../src/config/prisma.js', () => ({
  prisma: {
    qRToken: { findUnique: vi.fn() },
    guestSession: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    cart: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    cartItem: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    menuCategory: { findMany: vi.fn() },
    menuItem: { findFirst: vi.fn() },
    taxRule: { findMany: vi.fn() },
    payment: { findUnique: vi.fn() },
    customerOrder: { findMany: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

describe('Guest QR Ordering, Cart & Atomic Checkout API', () => {
  const app = createApp();

  const rawGuestToken = 'guest-capability-token-abc-123';
  const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const rstId = '11111111-1111-4111-8111-111111111111';
  const branchId = '22222222-2222-4222-8222-222222222222';
  const tableId = '33333333-3333-4333-8333-333333333333';
  const cartId = '44444444-4444-4444-8444-444444444444';
  const menuItemId = '55555555-5555-4555-8555-555555555555';
  const orderId = '66666666-6666-4666-8666-666666666666';

  const activeGuestSessionRecord = {
    id: sessionId,
    qrTokenId: 'qr-1',
    diningTableId: tableId,
    accessTokenHash: hashGuestToken(rawGuestToken),
    customerName: null,
    customerPhone: null,
    status: GuestSessionStatus.ACTIVE,
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    diningTable: {
      id: tableId,
      tableCode: 'T01',
      displayName: 'Table T01',
      status: TableStatus.ACTIVE,
      branch: {
        id: branchId,
        name: 'Main Branch',
        status: 'ACTIVE',
        restaurant: {
          id: rstId,
          name: 'ABC Restaurant',
          slug: 'abc-restaurant',
          logoUrl: null,
          status: RestaurantStatus.ACTIVE,
          payAtRestaurantEnabled: false,
          subscriptions: [
            {
              status: SubscriptionStatus.ACTIVE,
              endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          ],
        },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves valid QR token into a guest session and rejects expired subscriptions (BR-04)', async () => {
    // 1. Unknown/revoked QR token -> 404
    (prisma.qRToken.findUnique as any).mockResolvedValueOnce(null);
    const badQrRes = await request(app)
      .post('/api/v1/guest/sessions')
      .send({ token: 'unknown-token' });
    expect(badQrRes.status).toBe(404);

    // 2. Expired restaurant subscription -> 402
    (prisma.qRToken.findUnique as any).mockResolvedValueOnce({
      id: 'qr-exp',
      status: 'ACTIVE',
      revokedAt: null,
      expiresAt: null,
      diningTable: {
        id: tableId,
        tableCode: 'T01',
        displayName: 'Table T01',
        status: TableStatus.ACTIVE,
        branch: {
          id: branchId,
          name: 'Main Branch',
          status: 'ACTIVE',
          restaurant: {
            id: rstId,
            name: 'Expired Diner',
            slug: 'expired-diner',
            logoUrl: null,
            status: RestaurantStatus.ACTIVE,
            payAtRestaurantEnabled: true,
            subscriptions: [{ status: SubscriptionStatus.EXPIRED, endsAt: null }],
          },
        },
      },
    });
    const expRes = await request(app)
      .post('/api/v1/guest/sessions')
      .send({ token: 'expired-sub-qr' });
    expect(expRes.status).toBe(402);

    // 3. Valid QR token -> 201 with capability token & available payment methods
    (prisma.qRToken.findUnique as any).mockResolvedValueOnce({
      id: 'qr-valid',
      status: 'ACTIVE',
      revokedAt: null,
      expiresAt: null,
      diningTable: activeGuestSessionRecord.diningTable,
    });
    const txMock = {
      guestSession: {
        create: vi.fn().mockResolvedValue({
          id: sessionId,
          expiresAt: activeGuestSessionRecord.expiresAt,
        }),
      },
      cart: { create: vi.fn().mockResolvedValue({ id: cartId }) },
    };
    (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(txMock));

    const okRes = await request(app)
      .post('/api/v1/guest/sessions')
      .send({ token: 'valid-qr-secret', restaurantSlug: 'abc-restaurant', tableCode: 't01' });

    expect(okRes.status).toBe(201);
    expect(okRes.body.data.accessToken).toBeDefined();
    expect(okRes.body.data.availablePaymentMethods).toEqual([PaymentMethod.ONLINE]);
  });

  it('merges identical customized items in cart and prevents adding SOLD_OUT dishes', async () => {
    (prisma.guestSession.findUnique as any).mockResolvedValue(activeGuestSessionRecord);

    // 1. SOLD_OUT item rejected with 400
    (prisma.menuItem.findFirst as any).mockResolvedValueOnce({
      id: menuItemId,
      name: 'Sold Out Dish',
      availabilityStatus: ItemAvailability.SOLD_OUT,
      modifierGroups: [],
    });

    const soldOutRes = await request(app)
      .post('/api/v1/guest/cart/items')
      .set('x-guest-token', rawGuestToken)
      .send({ menuItemId, quantity: 1 });

    expect(soldOutRes.status).toBe(400);

    // 2. Identical variant merges quantity on existing CartItem
    (prisma.guestSession.findUnique as any).mockResolvedValue(activeGuestSessionRecord);
    (prisma.menuItem.findFirst as any).mockResolvedValueOnce({
      id: menuItemId,
      name: 'Royal Biryani',
      price: '320.00',
      availabilityStatus: ItemAvailability.AVAILABLE,
      modifierGroups: [],
    });
    (prisma.cart.findFirst as any).mockResolvedValue({ id: cartId, status: CartStatus.ACTIVE });
    (prisma.cartItem.findMany as any).mockResolvedValueOnce([
      {
        id: 'ci-existing',
        menuItemId,
        quantity: 1,
        notes: 'less spicy',
        selectedModifiers: [],
      },
    ]);
    (prisma.cartItem.update as any).mockResolvedValueOnce({ id: 'ci-existing', quantity: 3 });
    (prisma.cart.findUnique as any).mockResolvedValueOnce({
      id: cartId,
      status: CartStatus.ACTIVE,
      items: [
        {
          id: 'ci-existing',
          menuItemId,
          quantity: 3,
          unitPriceAtAdd: '320.00',
          notes: 'less spicy',
          menuItem: {
            id: menuItemId,
            name: 'Royal Biryani',
            imageUrl: null,
            price: '320.00',
            isVeg: false,
            availabilityStatus: ItemAvailability.AVAILABLE,
            category: { isActive: true },
          },
          selectedModifiers: [],
        },
      ],
    });
    (prisma.taxRule.findMany as any).mockResolvedValueOnce([]);

    const mergeRes = await request(app)
      .post('/api/v1/guest/cart/items')
      .set('x-guest-token', rawGuestToken)
      .send({ menuItemId, quantity: 2, notes: 'Less Spicy' });

    expect(mergeRes.status).toBe(201);
    expect(prisma.cartItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ci-existing' },
        data: expect.objectContaining({ quantity: 3 }),
      })
    );
    expect(mergeRes.body.data.pricing.grandTotal).toBe('960.00');
  });

  it('blocks PAY_AT_RESTAURANT when disabled and validates Indian mobile at checkout', async () => {
    (prisma.guestSession.findUnique as any).mockResolvedValue(activeGuestSessionRecord);

    const badPhoneRes = await request(app)
      .post('/api/v1/guest/orders')
      .set('x-guest-token', rawGuestToken)
      .send({
        customerName: 'Aarav',
        customerPhone: '12345',
        paymentMethod: PaymentMethod.ONLINE,
      });
    expect(badPhoneRes.status).toBe(400);

    (prisma.guestSession.findUnique as any).mockResolvedValue(activeGuestSessionRecord);
    const disabledCashRes = await request(app)
      .post('/api/v1/guest/orders')
      .set('x-guest-token', rawGuestToken)
      .send({
        customerName: 'Aarav',
        customerPhone: '9845022190',
        paymentMethod: PaymentMethod.PAY_AT_RESTAURANT,
      });
    expect(disabledCashRes.status).toBe(400);
    expect(disabledCashRes.body.error.message).toContain('Pay at Restaurant is not enabled');
  });

  it('detects price changes at checkout (409) and completes atomic order with snapshots + fresh cart', async () => {
    (prisma.guestSession.findUnique as any).mockResolvedValue(activeGuestSessionRecord);
    (prisma.payment.findUnique as any).mockResolvedValue(null);

    const now = new Date();
    const cartWithPriceChange = {
      id: cartId,
      status: CartStatus.ACTIVE,
      items: [
        {
          id: 'ci-1',
          quantity: 2,
          unitPriceAtAdd: '300.00', // added at 300
          menuItem: {
            id: menuItemId,
            name: 'Royal Biryani',
            price: '320.00', // live price changed to 320
            availabilityStatus: ItemAvailability.AVAILABLE,
            category: { isActive: true, restaurantId: rstId },
            modifierGroups: [],
          },
          selectedModifiers: [],
        },
      ],
    };

    const txConflictMock = {
      restaurant: {
        findUnique: vi.fn().mockResolvedValue(activeGuestSessionRecord.diningTable.branch.restaurant),
      },
      cart: { findFirst: vi.fn().mockResolvedValue(cartWithPriceChange) },
      taxRule: { findMany: vi.fn().mockResolvedValue([]) },
    };
    (prisma.$transaction as any).mockImplementationOnce(async (cb: any) => cb(txConflictMock));

    // 1. Rejects when price changed and acceptPriceChanges is false
    const priceChangedRes = await request(app)
      .post('/api/v1/guest/orders')
      .set('x-guest-token', rawGuestToken)
      .send({
        customerName: 'Aarav Mehta',
        customerPhone: '+91 98450 22190',
        paymentMethod: PaymentMethod.ONLINE,
        idempotencyKey: 'idem-key-001',
      });
    expect(priceChangedRes.status).toBe(409);
    expect(priceChangedRes.body.error.details.code).toBe('PRICE_CHANGED');

    // 2. Succeeds when acceptPriceChanges is true -> creates snapshots, order, payment, and new cart
    (prisma.guestSession.findUnique as any).mockResolvedValue(activeGuestSessionRecord);
    (prisma.payment.findUnique as any).mockResolvedValue(null);

    const txSuccessMock = {
      restaurant: {
        findUnique: vi.fn().mockResolvedValue(activeGuestSessionRecord.diningTable.branch.restaurant),
      },
      cart: {
        findFirst: vi.fn().mockResolvedValue(cartWithPriceChange),
        update: vi.fn().mockResolvedValue({ id: cartId, status: CartStatus.CHECKED_OUT }),
        create: vi.fn().mockResolvedValue({ id: 'cart-new', status: CartStatus.ACTIVE }),
      },
      taxRule: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'tax-gst',
            name: 'GST',
            rate: '5.00',
            calculationType: TaxCalculationType.PERCENTAGE,
            isActive: true,
            effectiveFrom: new Date(now.getTime() - 10000),
            effectiveTo: null,
          },
        ]),
      },
      customerOrder: {
        findFirst: vi.fn().mockResolvedValue({ orderNumber: 'SQ-1005' }),
        create: vi.fn().mockResolvedValue({
          id: orderId,
          orderNumber: 'SQ-1006',
          status: OrderStatus.PENDING,
          customerName: 'Aarav Mehta',
          customerPhone: '9845022190',
          subtotal: '640.00',
          taxTotal: '32.00',
          discountTotal: '0.00',
          grandTotal: '672.00',
          estimatedPrepMinutes: 15,
          notes: null,
          createdAt: now,
          updatedAt: now,
          restaurant: activeGuestSessionRecord.diningTable.branch.restaurant,
          branch: activeGuestSessionRecord.diningTable.branch,
          diningTable: activeGuestSessionRecord.diningTable,
          items: [
            {
              id: 'oi-1',
              menuItemId,
              itemNameSnapshot: 'Royal Biryani',
              quantity: 2,
              unitPrice: '320.00',
              lineTotal: '640.00',
              modifiers: [],
            },
          ],
          taxLines: [
            {
              id: 'otl-1',
              taxNameSnapshot: 'GST',
              rateSnapshot: '5.00',
              taxableAmount: '640.00',
              taxAmount: '32.00',
            },
          ],
          payments: [
            {
              id: 'pay-1',
              provider: 'RAZORPAY',
              method: PaymentMethod.ONLINE,
              status: PaymentStatus.INITIATED,
              amount: '672.00',
              currency: 'INR',
              verifiedAt: null,
            },
          ],
          statusHistory: [{ id: 'hist-1', toStatus: OrderStatus.PENDING }],
        }),
      },
      guestSession: { update: vi.fn().mockResolvedValue({}) },
    };
    (prisma.$transaction as any).mockImplementationOnce(async (cb: any) => cb(txSuccessMock));

    const okOrderRes = await request(app)
      .post('/api/v1/guest/orders')
      .set('x-guest-token', rawGuestToken)
      .send({
        customerName: 'Aarav Mehta',
        customerPhone: '+91 98450 22190',
        paymentMethod: PaymentMethod.ONLINE,
        idempotencyKey: 'idem-key-001',
        acceptPriceChanges: true,
      });

    expect(okOrderRes.status).toBe(201);
    expect(okOrderRes.body.data.idempotentReplay).toBe(false);
    expect(okOrderRes.body.data.order.orderNumber).toBe('SQ-1006');
    expect(okOrderRes.body.data.order.grandTotal).toBe('672.00');
    expect(okOrderRes.body.data.order.customerStage).toEqual({
      label: 'Order Placed',
      stepIndex: 0,
    });
    expect(txSuccessMock.cart.create).toHaveBeenCalledWith({
      data: { guestSessionId: sessionId, status: CartStatus.ACTIVE },
    });
  });

  it('replays existing order on duplicate idempotencyKey and scopes order access strictly to guestSession', async () => {
    // 1. Idempotency replay
    (prisma.guestSession.findUnique as any).mockResolvedValue(activeGuestSessionRecord);
    (prisma.payment.findUnique as any).mockResolvedValueOnce({
      id: 'pay-1',
      order: {
        id: orderId,
        guestSessionId: sessionId,
        orderNumber: 'SQ-1006',
        status: OrderStatus.PENDING,
        customerName: 'Aarav Mehta',
        customerPhone: '9845022190',
        subtotal: '640.00',
        taxTotal: '32.00',
        discountTotal: '0.00',
        grandTotal: '672.00',
        estimatedPrepMinutes: 15,
        items: [],
        taxLines: [],
        payments: [],
        statusHistory: [],
      },
    });

    const replayRes = await request(app)
      .post('/api/v1/guest/orders')
      .set('x-guest-token', rawGuestToken)
      .send({
        customerName: 'Aarav Mehta',
        customerPhone: '9845022190',
        paymentMethod: PaymentMethod.ONLINE,
        idempotencyKey: 'idem-key-001',
      });

    expect(replayRes.status).toBe(200);
    expect(replayRes.body.data.idempotentReplay).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    // 2. Guest cannot access another session's order -> 404
    (prisma.guestSession.findUnique as any).mockResolvedValue(activeGuestSessionRecord);
    (prisma.customerOrder.findFirst as any).mockResolvedValueOnce(null);

    const otherOrderRes = await request(app)
      .get(`/api/v1/guest/orders/${orderId}`)
      .set('x-guest-token', rawGuestToken);

    expect(otherOrderRes.status).toBe(404);
  });
});
