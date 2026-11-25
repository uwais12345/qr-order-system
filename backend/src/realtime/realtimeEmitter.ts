import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { mapOrderStatusToCustomerStage } from '../utils/orderHelpers.js';
import { RealtimeRooms } from './rooms.js';
import { authenticateSocketConnection, registerSocketHandlers } from './socketAuth.js';

export interface RealtimeOrderSummary {
  id: string;
  orderNumber: string;
  restaurantId: string;
  branchId: string;
  diningTableId: string;
  guestSessionId: string;
  status: OrderStatus;
  estimatedPrepMinutes: number | null;
  grandTotal?: string;
}

export interface RealtimeEventEnvelope<T = unknown> {
  schemaVersion: '1.0';
  eventType: string;
  timestamp: string;
  resource: {
    type: 'CustomerOrder';
    id: string;
    orderNumber: string;
    restaurantId: string;
    branchId: string;
  };
  payload: T;
}

let ioInstance: SocketIOServer | null = null;

export function initRealtime(httpServer: http.Server): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    },
  });

  io.use(authenticateSocketConnection);

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id, actor: socket.data.actor?.type }, 'Socket connected');
    registerSocketHandlers(socket);
  });

  ioInstance = io;
  return io;
}

export function getRealtimeIO(): SocketIOServer | null {
  return ioInstance;
}

function buildOrderEnvelope<T>(
  eventType: string,
  order: RealtimeOrderSummary,
  payload: T
): RealtimeEventEnvelope<T> {
  return {
    schemaVersion: '1.0',
    eventType,
    timestamp: new Date().toISOString(),
    resource: {
      type: 'CustomerOrder',
      id: order.id,
      orderNumber: order.orderNumber,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
    },
    payload,
  };
}

class RealtimeEmitter {
  emitOrderCreated(order: RealtimeOrderSummary): void {
    if (!ioInstance) return;

    const event = buildOrderEnvelope('order:created', order, {
      status: order.status,
      customerStage: mapOrderStatusToCustomerStage(order.status),
      estimatedPrepMinutes: order.estimatedPrepMinutes,
      grandTotal: order.grandTotal,
      diningTableId: order.diningTableId,
    });

    ioInstance
      .to(RealtimeRooms.restaurantKitchen(order.restaurantId))
      .to(RealtimeRooms.branchKitchen(order.branchId))
      .to(RealtimeRooms.restaurantAdmin(order.restaurantId))
      .to(RealtimeRooms.guestSession(order.guestSessionId))
      .emit('order:created', event);
  }

  emitOrderStatusUpdated(
    order: RealtimeOrderSummary,
    meta: { fromStatus: OrderStatus | null; toStatus: OrderStatus; reason?: string | null }
  ): void {
    if (!ioInstance) return;

    const event = buildOrderEnvelope('order:status_updated', order, {
      fromStatus: meta.fromStatus,
      toStatus: meta.toStatus,
      customerStage: mapOrderStatusToCustomerStage(meta.toStatus),
      estimatedPrepMinutes: order.estimatedPrepMinutes,
      reason: meta.reason ?? null,
    });

    ioInstance
      .to(RealtimeRooms.restaurantKitchen(order.restaurantId))
      .to(RealtimeRooms.branchKitchen(order.branchId))
      .to(RealtimeRooms.restaurantAdmin(order.restaurantId))
      .to(RealtimeRooms.guestSession(order.guestSessionId))
      .to(RealtimeRooms.order(order.id))
      .emit('order:status_updated', event);
  }

  emitOrderEstimateUpdated(order: RealtimeOrderSummary): void {
    if (!ioInstance) return;

    const event = buildOrderEnvelope('order:estimate_updated', order, {
      status: order.status,
      estimatedPrepMinutes: order.estimatedPrepMinutes,
    });

    ioInstance
      .to(RealtimeRooms.restaurantKitchen(order.restaurantId))
      .to(RealtimeRooms.branchKitchen(order.branchId))
      .to(RealtimeRooms.restaurantAdmin(order.restaurantId))
      .to(RealtimeRooms.guestSession(order.guestSessionId))
      .to(RealtimeRooms.order(order.id))
      .emit('order:estimate_updated', event);
  }

  emitPaymentUpdated(
    order: RealtimeOrderSummary,
    payment: {
      id: string;
      method: PaymentMethod;
      status: PaymentStatus;
      amount: string;
      verifiedAt: Date | null;
    }
  ): void {
    if (!ioInstance) return;

    const event = buildOrderEnvelope('payment:updated', order, {
      paymentId: payment.id,
      method: payment.method,
      status: payment.status,
      amount: payment.amount,
      verifiedAt: payment.verifiedAt,
    });

    ioInstance
      .to(RealtimeRooms.restaurantKitchen(order.restaurantId))
      .to(RealtimeRooms.restaurantAdmin(order.restaurantId))
      .to(RealtimeRooms.guestSession(order.guestSessionId))
      .to(RealtimeRooms.order(order.id))
      .emit('payment:updated', event);
  }
}

export const realtimeEmitter = new RealtimeEmitter();
