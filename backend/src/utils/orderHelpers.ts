import { OrderStatus, Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';

const CUSTOMER_STAGE_LABELS: Record<OrderStatus, { label: string; stepIndex: number }> = {
  [OrderStatus.PENDING]: { label: 'Order Placed', stepIndex: 0 },
  [OrderStatus.ACCEPTED]: { label: 'Order Accepted', stepIndex: 1 },
  [OrderStatus.PREPARING]: { label: 'Preparing', stepIndex: 2 },
  [OrderStatus.READY]: { label: 'Ready', stepIndex: 3 },
  [OrderStatus.SERVED]: { label: 'Served', stepIndex: 4 },
  [OrderStatus.REJECTED]: { label: 'Rejected', stepIndex: -1 },
  [OrderStatus.CANCELLED]: { label: 'Cancelled', stepIndex: -1 },
};

export function mapOrderStatusToCustomerStage(status: OrderStatus) {
  return CUSTOMER_STAGE_LABELS[status];
}

/**
 * Generates a unique human-readable order number (e.g. SQ-1001) inside a transaction.
 */
export async function generateNextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const latestOrder = await tx.customerOrder.findFirst({
    where: {
      orderNumber: { startsWith: 'SQ-' },
    },
    orderBy: [{ createdAt: 'desc' }, { orderNumber: 'desc' }],
    select: { orderNumber: true },
  });

  let nextSeq = 1001;
  if (latestOrder?.orderNumber) {
    const match = latestOrder.orderNumber.match(/^SQ-(\d+)$/);
    if (match) {
      nextSeq = Math.max(1001, parseInt(match[1], 10) + 1);
    }
  }

  return `SQ-${nextSeq}`;
}

/**
 * Shared serializer for CustomerOrder payloads across Guest and Restaurant/KDS endpoints.
 */
export function serializeOrder(order: any) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    restaurantId: order.restaurantId,
    branchId: order.branchId,
    diningTableId: order.diningTableId,
    guestSessionId: order.guestSessionId,
    status: order.status,
    customerStage: mapOrderStatusToCustomerStage(order.status),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    subtotal: new Decimal(order.subtotal).toFixed(2),
    taxTotal: new Decimal(order.taxTotal).toFixed(2),
    discountTotal: new Decimal(order.discountTotal).toFixed(2),
    grandTotal: new Decimal(order.grandTotal).toFixed(2),
    estimatedPrepMinutes: order.estimatedPrepMinutes,
    estimateUpdatedAt: order.estimateUpdatedAt ?? null,
    notes: order.notes ?? null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    restaurant: order.restaurant
      ? {
          id: order.restaurant.id,
          name: order.restaurant.name,
          slug: order.restaurant.slug,
          logoUrl: order.restaurant.logoUrl,
        }
      : undefined,
    branch: order.branch
      ? { id: order.branch.id, name: order.branch.name }
      : undefined,
    table: order.diningTable
      ? {
          id: order.diningTable.id,
          tableCode: order.diningTable.tableCode,
          displayName: order.diningTable.displayName,
        }
      : undefined,
    items: (order.items ?? []).map((item: any) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      name: item.itemNameSnapshot,
      quantity: item.quantity,
      unitPrice: new Decimal(item.unitPrice).toFixed(2),
      lineTotal: new Decimal(item.lineTotal).toFixed(2),
      modifiers: (item.modifiers ?? []).map((mod: any) => ({
        id: mod.id,
        modifierName: mod.modifierNameSnapshot,
        optionName: mod.optionNameSnapshot,
        priceDelta: new Decimal(mod.priceDelta).toFixed(2),
      })),
    })),
    taxLines: (order.taxLines ?? []).map((tl: any) => ({
      id: tl.id,
      taxName: tl.taxNameSnapshot,
      rate: new Decimal(tl.rateSnapshot).toFixed(2),
      taxableAmount: new Decimal(tl.taxableAmount).toFixed(2),
      taxAmount: new Decimal(tl.taxAmount).toFixed(2),
    })),
    payments: (order.payments ?? []).map((p: any) => ({
      id: p.id,
      provider: p.provider,
      method: p.method,
      status: p.status,
      amount: new Decimal(p.amount).toFixed(2),
      currency: p.currency,
      verifiedAt: p.verifiedAt,
    })),
    statusHistory: order.statusHistory ?? [],
  };
}
