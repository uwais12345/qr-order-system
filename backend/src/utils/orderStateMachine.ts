import { OrderStatus, RestaurantRole } from '@prisma/client';
import { BadRequestError, ForbiddenError } from './errors.js';

export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.REJECTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY],
  [OrderStatus.READY]: [OrderStatus.SERVED],
  [OrderStatus.SERVED]: [],
  [OrderStatus.REJECTED]: [],
  [OrderStatus.CANCELLED]: [],
};

const NEXT_KDS_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  [OrderStatus.PENDING]: OrderStatus.ACCEPTED,
  [OrderStatus.ACCEPTED]: OrderStatus.PREPARING,
  [OrderStatus.PREPARING]: OrderStatus.READY,
  [OrderStatus.READY]: OrderStatus.SERVED,
};

export function getNextKdsStatus(currentStatus: OrderStatus): OrderStatus | null {
  return NEXT_KDS_STATUS[currentStatus] ?? null;
}

/**
 * Validates that an order status transition is permitted by both the state machine
 * and the acting staff member's role.
 */
export function validateOrderTransition(
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  actorRole: RestaurantRole | 'SUPER_ADMIN',
  reason?: string
): void {
  if (fromStatus === toStatus) {
    throw new BadRequestError(`Order is already in ${toStatus} status`);
  }

  const allowedTargets = ALLOWED_ORDER_TRANSITIONS[fromStatus] ?? [];
  if (!allowedTargets.includes(toStatus)) {
    throw new BadRequestError(
      `Invalid order transition from ${fromStatus} to ${toStatus}. Allowed transitions: ${
        allowedTargets.length > 0 ? allowedTargets.join(', ') : 'none (terminal state)'
      }`
    );
  }

  if (
    toStatus === OrderStatus.CANCELLED &&
    actorRole !== RestaurantRole.OWNER &&
    actorRole !== 'SUPER_ADMIN'
  ) {
    throw new ForbiddenError('Only a restaurant owner or platform admin can cancel an order');
  }

  if (
    (toStatus === OrderStatus.REJECTED || toStatus === OrderStatus.CANCELLED) &&
    (!reason || reason.trim().length < 3)
  ) {
    throw new BadRequestError(
      `A reason (minimum 3 characters) is required when marking an order as ${toStatus}`
    );
  }
}
