import crypto from 'crypto';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { recordAuditLog } from '../../utils/audit.js';
import { realtimeEmitter } from '../../realtime/realtimeEmitter.js';
import { GuestSessionContext } from '../../types/express.js';
import { PaymentGatewayAdapter, paymentGatewayAdapter } from './paymentProvider.js';
import {
  CreateGatewayOrderInput,
  SettleOfflinePaymentInput,
  VerifyGatewayPaymentInput,
} from './payment.schema.js';

interface RazorpayWebhookPayload {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
      };
    };
  };
}

export class PaymentService {
  constructor(private readonly gateway: PaymentGatewayAdapter = paymentGatewayAdapter) {}

  async createGatewayOrder(guestSession: GuestSessionContext, input: CreateGatewayOrderInput) {
    const order = await prisma.customerOrder.findFirst({
      where: { id: input.orderId, guestSessionId: guestSession.id },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });

    if (!order) {
      throw new NotFoundError('Order not found for your guest session');
    }

    if (order.status === OrderStatus.REJECTED || order.status === OrderStatus.CANCELLED) {
      throw new BadRequestError(`Cannot initiate payment for a ${order.status.toLowerCase()} order`);
    }

    const alreadyPaid = order.payments.some((p) => p.status === PaymentStatus.SUCCEEDED);
    if (alreadyPaid) {
      throw new ConflictError('This order has already been paid');
    }

    // Reuse an existing active gateway order if already generated for this order
    const reusablePayment = order.payments.find(
      (p) =>
        p.method === PaymentMethod.ONLINE &&
        p.providerOrderRef &&
        (p.status === PaymentStatus.INITIATED || p.status === PaymentStatus.PENDING)
    );

    const amountPaise = new Decimal(order.grandTotal)
      .times(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();

    if (reusablePayment && reusablePayment.providerOrderRef) {
      return {
        paymentId: reusablePayment.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        provider: reusablePayment.provider,
        keyId: env.RAZORPAY_KEY_ID,
        providerOrderId: reusablePayment.providerOrderRef,
        amount: new Decimal(order.grandTotal).toFixed(2),
        amountPaise,
        currency: reusablePayment.currency,
      };
    }

    const gatewayOrder = await this.gateway.createOrder({
      amountPaise,
      currency: 'INR',
      receipt: order.orderNumber,
      notes: {
        orderId: order.id,
        restaurantId: order.restaurantId,
      },
    });

    const pendingOnlineWithoutRef = order.payments.find(
      (p) =>
        p.method === PaymentMethod.ONLINE &&
        !p.providerOrderRef &&
        p.status === PaymentStatus.INITIATED
    );

    const payment = pendingOnlineWithoutRef
      ? await prisma.payment.update({
          where: { id: pendingOnlineWithoutRef.id },
          data: {
            provider: this.gateway.providerName,
            providerOrderRef: gatewayOrder.providerOrderId,
            status: PaymentStatus.PENDING,
          },
        })
      : await prisma.payment.create({
          data: {
            orderId: order.id,
            provider: this.gateway.providerName,
            method: PaymentMethod.ONLINE,
            status: PaymentStatus.PENDING,
            amount: order.grandTotal,
            currency: gatewayOrder.currency,
            providerOrderRef: gatewayOrder.providerOrderId,
            idempotencyKey: input.idempotencyKey?.trim() || `pay_${crypto.randomUUID()}`,
          },
        });

    return {
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: payment.provider,
      keyId: env.RAZORPAY_KEY_ID,
      providerOrderId: gatewayOrder.providerOrderId,
      amount: new Decimal(payment.amount).toFixed(2),
      amountPaise: gatewayOrder.amountPaise,
      currency: payment.currency,
    };
  }

  async verifyGatewayPayment(guestSession: GuestSessionContext, input: VerifyGatewayPaymentInput) {
    const order = await prisma.customerOrder.findFirst({
      where: { id: input.orderId, guestSessionId: guestSession.id },
      include: { payments: true },
    });

    if (!order) {
      throw new NotFoundError('Order not found for your guest session');
    }

    const payment = order.payments.find((p) => p.providerOrderRef === input.razorpayOrderId);
    if (!payment) {
      throw new NotFoundError('No matching payment attempt found for this order');
    }

    if (payment.status === PaymentStatus.SUCCEEDED) {
      return {
        verified: true,
        idempotentReplay: true,
        payment: {
          id: payment.id,
          status: payment.status,
          method: payment.method,
          amount: new Decimal(payment.amount).toFixed(2),
          verifiedAt: payment.verifiedAt,
        },
      };
    }

    const isSignatureValid = this.gateway.verifyCheckoutSignature({
      providerOrderId: input.razorpayOrderId,
      providerPaymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
    });

    if (!isSignatureValid) {
      logger.warn(
        { orderId: order.id, paymentId: payment.id, providerOrderRef: input.razorpayOrderId },
        'Rejected payment verification due to invalid cryptographic signature'
      );
      throw new BadRequestError('Payment signature verification failed');
    }

    const now = new Date();
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCEEDED,
        providerPaymentRef: input.razorpayPaymentId,
        verifiedAt: now,
      },
    });

    realtimeEmitter.emitPaymentUpdated(
      {
        id: order.id,
        orderNumber: order.orderNumber,
        restaurantId: order.restaurantId,
        branchId: order.branchId,
        diningTableId: order.diningTableId,
        guestSessionId: order.guestSessionId,
        status: order.status,
        estimatedPrepMinutes: order.estimatedPrepMinutes,
      },
      {
        id: updated.id,
        method: updated.method,
        status: updated.status,
        amount: new Decimal(updated.amount).toFixed(2),
        verifiedAt: updated.verifiedAt,
      }
    );

    return {
      verified: true,
      idempotentReplay: false,
      payment: {
        id: updated.id,
        status: updated.status,
        method: updated.method,
        amount: new Decimal(updated.amount).toFixed(2),
        verifiedAt: updated.verifiedAt,
      },
    };
  }

  async processWebhook(rawBody: Buffer, signatureHeader: string, eventIdHeader?: string) {
    if (!this.gateway.verifyWebhookSignature(rawBody, signatureHeader)) {
      logger.warn('Rejected Razorpay webhook due to invalid signature');
      throw new BadRequestError('Invalid webhook signature');
    }

    let parsed: RazorpayWebhookPayload;
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookPayload;
    } catch {
      throw new BadRequestError('Malformed JSON webhook payload');
    }

    const eventType = parsed.event || 'unknown';
    const entity = parsed.payload?.payment?.entity;
    const providerOrderId = entity?.order_id;
    const providerPaymentId = entity?.id;

    const providerEventId =
      eventIdHeader?.trim() ||
      `evt_${crypto
        .createHash('sha256')
        .update(`${eventType}:${providerOrderId ?? ''}:${providerPaymentId ?? ''}:${entity?.status ?? ''}`)
        .digest('hex')}`;

    const result = await prisma.$transaction(async (tx) => {
      const existingEvent = await tx.paymentWebhookEvent.findUnique({
        where: { providerEventId },
      });

      if (existingEvent?.processedAt) {
        return {
          duplicate: true,
          eventType,
          providerEventId,
          updatedOrder: null as any,
          updatedPayment: null as any,
        };
      }

      const payment = providerOrderId
        ? await tx.payment.findFirst({
            where: { providerOrderRef: providerOrderId },
            include: { order: true },
          })
        : null;

      const sanitizedReference: Prisma.InputJsonValue = {
        eventType,
        providerOrderId: providerOrderId ?? null,
        providerPaymentId: providerPaymentId ?? null,
        amountPaise: entity?.amount ?? null,
        status: entity?.status ?? null,
      };

      const webhookRecord = existingEvent
        ? existingEvent
        : await tx.paymentWebhookEvent.create({
            data: {
              paymentId: payment?.id ?? null,
              providerEventId,
              eventType,
              signatureVerified: true,
              payloadReference: sanitizedReference,
            },
          });

      let updatedPayment = null;
      const now = new Date();

      if (payment) {
        const expectedPaise = new Decimal(payment.amount)
          .times(100)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .toNumber();

        if (eventType === 'payment.captured' || eventType === 'order.paid') {
          const capturedPaise = entity?.amount ?? 0;
          if (capturedPaise >= expectedPaise && payment.status !== PaymentStatus.SUCCEEDED) {
            updatedPayment = await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: PaymentStatus.SUCCEEDED,
                providerPaymentRef: providerPaymentId ?? payment.providerPaymentRef,
                verifiedAt: now,
              },
            });
          }
        } else if (eventType === 'payment.failed') {
          if (payment.status !== PaymentStatus.SUCCEEDED) {
            updatedPayment = await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: PaymentStatus.FAILED,
                providerPaymentRef: providerPaymentId ?? payment.providerPaymentRef,
              },
            });
          }
        } else if (eventType === 'refund.processed' || eventType === 'payment.refunded') {
          updatedPayment = await tx.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.REFUNDED },
          });
        }
      }

      await tx.paymentWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: { processedAt: now },
      });

      return {
        duplicate: false,
        eventType,
        providerEventId,
        updatedOrder: payment?.order ?? null,
        updatedPayment,
      };
    });

    if (result.updatedOrder && result.updatedPayment) {
      realtimeEmitter.emitPaymentUpdated(
        {
          id: result.updatedOrder.id,
          orderNumber: result.updatedOrder.orderNumber,
          restaurantId: result.updatedOrder.restaurantId,
          branchId: result.updatedOrder.branchId,
          diningTableId: result.updatedOrder.diningTableId,
          guestSessionId: result.updatedOrder.guestSessionId,
          status: result.updatedOrder.status,
          estimatedPrepMinutes: result.updatedOrder.estimatedPrepMinutes,
        },
        {
          id: result.updatedPayment.id,
          method: result.updatedPayment.method,
          status: result.updatedPayment.status,
          amount: new Decimal(result.updatedPayment.amount).toFixed(2),
          verifiedAt: result.updatedPayment.verifiedAt,
        }
      );
    }

    return {
      duplicate: result.duplicate,
      eventType: result.eventType,
      providerEventId: result.providerEventId,
      paymentStatus: result.updatedPayment?.status ?? null,
    };
  }

  async settleOfflinePayment(
    restaurantId: string,
    orderId: string,
    input: SettleOfflinePaymentInput,
    actorUserId: string
  ) {
    const order = await prisma.customerOrder.findFirst({
      where: { id: orderId, restaurantId },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });

    if (!order) {
      throw new NotFoundError('Order not found for this restaurant');
    }

    if (order.status === OrderStatus.REJECTED || order.status === OrderStatus.CANCELLED) {
      throw new BadRequestError(`Cannot settle payment for a ${order.status.toLowerCase()} order`);
    }

    const alreadyPaid = order.payments.some((p) => p.status === PaymentStatus.SUCCEEDED);
    if (alreadyPaid) {
      throw new ConflictError('Order payment is already settled');
    }

    const now = new Date();
    const pendingOffline = order.payments.find(
      (p) => p.method === PaymentMethod.PAY_AT_RESTAURANT && p.status === PaymentStatus.PENDING
    );

    const settledPayment = await prisma.$transaction(async (tx) => {
      const payment = pendingOffline
        ? await tx.payment.update({
            where: { id: pendingOffline.id },
            data: {
              provider: input.channel,
              status: PaymentStatus.SUCCEEDED,
              providerPaymentRef: input.reference || 'CASHIER_SETTLED',
              verifiedAt: now,
            },
          })
        : await tx.payment.create({
            data: {
              orderId: order.id,
              provider: input.channel,
              method: PaymentMethod.PAY_AT_RESTAURANT,
              status: PaymentStatus.SUCCEEDED,
              amount: order.grandTotal,
              currency: 'INR',
              providerPaymentRef: input.reference || 'CASHIER_SETTLED',
              idempotencyKey: `offline_${order.id}_${crypto.randomUUID()}`,
              verifiedAt: now,
            },
          });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'OFFLINE_PAYMENT_SETTLED',
        entityType: 'Payment',
        entityId: payment.id,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          channel: input.channel,
          amount: new Decimal(payment.amount).toFixed(2),
        },
      });

      return payment;
    });

    realtimeEmitter.emitPaymentUpdated(
      {
        id: order.id,
        orderNumber: order.orderNumber,
        restaurantId: order.restaurantId,
        branchId: order.branchId,
        diningTableId: order.diningTableId,
        guestSessionId: order.guestSessionId,
        status: order.status,
        estimatedPrepMinutes: order.estimatedPrepMinutes,
      },
      {
        id: settledPayment.id,
        method: settledPayment.method,
        status: settledPayment.status,
        amount: new Decimal(settledPayment.amount).toFixed(2),
        verifiedAt: settledPayment.verifiedAt,
      }
    );

    return {
      id: settledPayment.id,
      orderId: order.id,
      method: settledPayment.method,
      provider: settledPayment.provider,
      status: settledPayment.status,
      amount: new Decimal(settledPayment.amount).toFixed(2),
      verifiedAt: settledPayment.verifiedAt,
    };
  }

  async getVerifiedRevenueSummary(restaurantId: string, branchId?: string) {
    const orderFilter: Prisma.CustomerOrderWhereInput = {
      restaurantId,
      ...(branchId ? { branchId } : {}),
    };

    const [verifiedByMethod, statusCounts] = await Promise.all([
      prisma.payment.groupBy({
        by: ['method'],
        where: {
          order: orderFilter,
          status: PaymentStatus.SUCCEEDED,
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.payment.groupBy({
        by: ['status'],
        where: { order: orderFilter },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const totalVerifiedRevenue = verifiedByMethod.reduce(
      (acc, row) => acc.plus(new Decimal(row._sum.amount ?? 0)),
      new Decimal(0)
    );

    return {
      verifiedRevenueTotal: totalVerifiedRevenue.toFixed(2),
      verifiedByMethod: verifiedByMethod.map((row) => ({
        method: row.method,
        count: row._count.id,
        amount: new Decimal(row._sum.amount ?? 0).toFixed(2),
      })),
      breakdownByStatus: statusCounts.map((row) => ({
        status: row.status,
        count: row._count.id,
        amount: new Decimal(row._sum.amount ?? 0).toFixed(2),
      })),
    };
  }
}

export const paymentService = new PaymentService();
