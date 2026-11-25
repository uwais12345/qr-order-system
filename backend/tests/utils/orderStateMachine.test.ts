import { describe, it, expect } from 'vitest';
import { OrderStatus, RestaurantRole } from '@prisma/client';
import {
  getNextKdsStatus,
  validateOrderTransition,
} from '../../src/utils/orderStateMachine.js';
import { BadRequestError, ForbiddenError } from '../../src/utils/errors.js';

describe('Order State Machine', () => {
  it('permits valid KDS progression and returns next status', () => {
    expect(getNextKdsStatus(OrderStatus.PENDING)).toBe(OrderStatus.ACCEPTED);
    expect(getNextKdsStatus(OrderStatus.ACCEPTED)).toBe(OrderStatus.PREPARING);
    expect(getNextKdsStatus(OrderStatus.PREPARING)).toBe(OrderStatus.READY);
    expect(getNextKdsStatus(OrderStatus.READY)).toBe(OrderStatus.SERVED);
    expect(getNextKdsStatus(OrderStatus.SERVED)).toBeNull();

    expect(() =>
      validateOrderTransition(OrderStatus.PENDING, OrderStatus.ACCEPTED, RestaurantRole.KITCHEN)
    ).not.toThrow();
    expect(() =>
      validateOrderTransition(OrderStatus.ACCEPTED, OrderStatus.PREPARING, RestaurantRole.KITCHEN)
    ).not.toThrow();
    expect(() =>
      validateOrderTransition(OrderStatus.PREPARING, OrderStatus.READY, RestaurantRole.KITCHEN)
    ).not.toThrow();
    expect(() =>
      validateOrderTransition(OrderStatus.READY, OrderStatus.SERVED, RestaurantRole.KITCHEN)
    ).not.toThrow();
  });

  it('rejects invalid status skips, backwards transitions, and terminal transitions', () => {
    expect(() =>
      validateOrderTransition(OrderStatus.PENDING, OrderStatus.SERVED, RestaurantRole.OWNER)
    ).toThrow(BadRequestError);
    expect(() =>
      validateOrderTransition(OrderStatus.PREPARING, OrderStatus.ACCEPTED, RestaurantRole.KITCHEN)
    ).toThrow(BadRequestError);
    expect(() =>
      validateOrderTransition(OrderStatus.SERVED, OrderStatus.READY, RestaurantRole.OWNER)
    ).toThrow(BadRequestError);
    expect(() =>
      validateOrderTransition(OrderStatus.PENDING, OrderStatus.PENDING, RestaurantRole.KITCHEN)
    ).toThrow(BadRequestError);
  });

  it('enforces cancellation role permissions and rejection/cancellation reasons', () => {
    // Missing reason on REJECTED -> BadRequestError
    expect(() =>
      validateOrderTransition(OrderStatus.PENDING, OrderStatus.REJECTED, RestaurantRole.KITCHEN)
    ).toThrow(BadRequestError);

    // KITCHEN can REJECT from PENDING with valid reason
    expect(() =>
      validateOrderTransition(
        OrderStatus.PENDING,
        OrderStatus.REJECTED,
        RestaurantRole.KITCHEN,
        'Out of biryani'
      )
    ).not.toThrow();

    // KITCHEN cannot CANCEL -> ForbiddenError
    expect(() =>
      validateOrderTransition(
        OrderStatus.ACCEPTED,
        OrderStatus.CANCELLED,
        RestaurantRole.KITCHEN,
        'Customer left'
      )
    ).toThrow(ForbiddenError);

    // OWNER can CANCEL with valid reason
    expect(() =>
      validateOrderTransition(
        OrderStatus.ACCEPTED,
        OrderStatus.CANCELLED,
        RestaurantRole.OWNER,
        'Customer requested refund'
      )
    ).not.toThrow();
  });
});
