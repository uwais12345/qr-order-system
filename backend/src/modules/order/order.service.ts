import { OrderStatus, Prisma, RestaurantRole } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import { recordAuditLog } from '../../utils/audit.js';
import { serializeOrder } from '../../utils/orderHelpers.js';
import { validateOrderTransition } from '../../utils/orderStateMachine.js';
import { realtimeEmitter } from '../../realtime/realtimeEmitter.js';
import { ListOrdersQuery, UpdateOrderStatusInput } from './order.schema.js';

const ACTIVE_KDS_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
];

const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.SERVED,
  OrderStatus.REJECTED,
  OrderStatus.CANCELLED,
];

export class OrderService {
  async listOrders(restaurantId: string, query: ListOrdersQuery) {
    const where: Prisma.CustomerOrderWhereInput = {
      restaurantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.tableId ? { diningTableId: query.tableId } : {}),
      ...(query.status
        ? { status: query.status }
        : query.activeOnly
        ? { status: { in: ACTIVE_KDS_STATUSES } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.customerOrder.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: query.activeOnly ? 'asc' : 'desc' },
        include: {
          branch: { select: { id: true, name: true } },
          diningTable: { select: { id: true, tableCode: true, displayName: true } },
          items: { include: { modifiers: true } },
          taxLines: true,
          payments: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      }),
      prisma.customerOrder.count({ where }),
    ]);

    return {
      items: items.map(serializeOrder),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getOrderById(restaurantId: string, orderId: string) {
    const order = await prisma.customerOrder.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        branch: { select: { id: true, name: true } },
        diningTable: { select: { id: true, tableCode: true, displayName: true } },
        items: { include: { modifiers: true } },
        taxLines: true,
        payments: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: {
            changedByUser: { select: { id: true, displayName: true, email: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found for this restaurant');
    }

    return serializeOrder(order);
  }

  async transitionOrderStatus(
    restaurantId: string,
    orderId: string,
    input: UpdateOrderStatusInput,
    actorUserId: string,
    actorRole: RestaurantRole | 'SUPER_ADMIN'
  ) {
    const existing = await prisma.customerOrder.findFirst({
      where: { id: orderId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Order not found for this restaurant');
    }

    validateOrderTransition(existing.status, input.toStatus, actorRole, input.reason);

    const now = new Date();
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.customerOrder.update({
        where: { id: orderId },
        data: {
          status: input.toStatus,
          ...(input.estimatedPrepMinutes !== undefined
            ? {
                estimatedPrepMinutes: input.estimatedPrepMinutes,
                estimateUpdatedAt: now,
              }
            : {}),
        },
        include: {
          branch: { select: { id: true, name: true } },
          diningTable: { select: { id: true, tableCode: true, displayName: true } },
          items: { include: { modifiers: true } },
          taxLines: true,
          payments: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: existing.status,
          toStatus: input.toStatus,
          changedByUserId: actorUserId,
          reason: input.reason ?? null,
        },
      });

      if (input.toStatus === OrderStatus.REJECTED || input.toStatus === OrderStatus.CANCELLED) {
        await recordAuditLog(tx, {
          actorUserId,
          restaurantId,
          action: `ORDER_${input.toStatus}`,
          entityType: 'CustomerOrder',
          entityId: orderId,
          metadata: {
            orderNumber: existing.orderNumber,
            fromStatus: existing.status,
            toStatus: input.toStatus,
            reason: input.reason ?? null,
          },
        });
      }

      return tx.customerOrder.findUniqueOrThrow({
        where: { id: updated.id },
        include: {
          branch: { select: { id: true, name: true } },
          diningTable: { select: { id: true, tableCode: true, displayName: true } },
          items: { include: { modifiers: true } },
          taxLines: true,
          payments: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    // Emit real-time event ONLY after DB transaction succeeds (FR-RT-01)
    realtimeEmitter.emitOrderStatusUpdated(
      {
        id: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        restaurantId: updatedOrder.restaurantId,
        branchId: updatedOrder.branchId,
        diningTableId: updatedOrder.diningTableId,
        guestSessionId: updatedOrder.guestSessionId,
        status: updatedOrder.status,
        estimatedPrepMinutes: updatedOrder.estimatedPrepMinutes,
      },
      {
        fromStatus: existing.status,
        toStatus: updatedOrder.status,
        reason: input.reason ?? null,
      }
    );

    return serializeOrder(updatedOrder);
  }

  async updatePrepEstimate(
    restaurantId: string,
    orderId: string,
    estimatedPrepMinutes: number,
    actorUserId: string
  ) {
    const existing = await prisma.customerOrder.findFirst({
      where: { id: orderId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Order not found for this restaurant');
    }

    if (TERMINAL_ORDER_STATUSES.includes(existing.status)) {
      throw new BadRequestError(
        `Cannot update preparation estimate when order is in terminal ${existing.status} state`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.customerOrder.update({
        where: { id: orderId },
        data: {
          estimatedPrepMinutes,
          estimateUpdatedAt: new Date(),
        },
        include: {
          branch: { select: { id: true, name: true } },
          diningTable: { select: { id: true, tableCode: true, displayName: true } },
          items: { include: { modifiers: true } },
          taxLines: true,
          payments: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'ORDER_ESTIMATE_UPDATED',
        entityType: 'CustomerOrder',
        entityId: orderId,
        metadata: {
          orderNumber: existing.orderNumber,
          previousEstimate: existing.estimatedPrepMinutes,
          newEstimate: estimatedPrepMinutes,
        },
      });

      return order;
    });

    realtimeEmitter.emitOrderEstimateUpdated({
      id: updated.id,
      orderNumber: updated.orderNumber,
      restaurantId: updated.restaurantId,
      branchId: updated.branchId,
      diningTableId: updated.diningTableId,
      guestSessionId: updated.guestSessionId,
      status: updated.status,
      estimatedPrepMinutes: updated.estimatedPrepMinutes,
    });

    return serializeOrder(updated);
  }
}

export const orderService = new OrderService();
