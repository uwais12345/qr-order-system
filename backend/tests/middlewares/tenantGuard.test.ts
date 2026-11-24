import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { PlatformRole, RestaurantRole, SubscriptionStatus } from '@prisma/client';
import { requireTenant } from '../../src/middlewares/tenantGuard.js';
import { prisma } from '../../src/config/prisma.js';
import { ForbiddenError, SubscriptionInactiveError, UnauthorizedError } from '../../src/utils/errors.js';

vi.mock('../../src/config/prisma.js', () => ({
  prisma: {
    restaurant: {
      findFirst: vi.fn(),
    },
  },
}));

describe('Tenant Isolation Middleware (requireTenant)', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = {};
    nextFn = vi.fn();
  });

  it('should throw UnauthorizedError if user is not attached to request', async () => {
    mockReq = {
      params: { restaurantId: 'rst-1' },
    };

    const middleware = requireTenant();
    await middleware(mockReq as Request, mockRes as Response, nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('should allow SUPER_ADMIN to access any restaurant context', async () => {
    mockReq = {
      user: {
        id: 'sa-1',
        email: 'admin@serveqr.io',
        displayName: 'Platform Admin',
        platformRole: PlatformRole.SUPER_ADMIN,
        memberships: [],
      },
      params: { restaurantId: 'rst-any-restaurant' },
    };

    (prisma.restaurant.findFirst as any).mockResolvedValue({
      id: 'rst-any-restaurant',
      tenantId: 'tenant-100',
      name: 'Any Restaurant',
      slug: 'any-restaurant',
      subscriptions: [{ id: 'sub-1', status: SubscriptionStatus.ACTIVE, endsAt: null }],
    });

    const middleware = requireTenant();
    await middleware(mockReq as Request, mockRes as Response, nextFn);

    expect(nextFn).toHaveBeenCalledWith();
    expect(mockReq.tenantContext?.userRole).toBe('SUPER_ADMIN');
    expect(mockReq.tenantContext?.restaurantId).toBe('rst-any-restaurant');
  });

  it('should block a user from accessing another restaurant they do not belong to (NFR-02)', async () => {
    mockReq = {
      user: {
        id: 'owner-1',
        email: 'owner1@other.in',
        displayName: 'Other Owner',
        platformRole: PlatformRole.RESTAURANT_USER,
        memberships: [
          {
            id: 'mem-1',
            restaurantId: 'rst-restaurant-A',
            role: RestaurantRole.OWNER,
            status: 'ACTIVE',
            restaurant: {
              id: 'rst-restaurant-A',
              tenantId: 'tenant-A',
              name: 'Restaurant A',
              slug: 'restaurant-a',
              status: 'ACTIVE',
              subscriptions: [{ id: 's1', status: SubscriptionStatus.ACTIVE, endsAt: null }],
            },
          },
        ],
      },
      params: { restaurantId: 'rst-restaurant-B' }, // attempting to access Restaurant B
    };

    (prisma.restaurant.findFirst as any).mockResolvedValue({
      id: 'rst-restaurant-B',
      tenantId: 'tenant-B',
      name: 'Restaurant B',
      slug: 'restaurant-b',
      subscriptions: [{ id: 's2', status: SubscriptionStatus.ACTIVE, endsAt: null }],
    });

    const middleware = requireTenant();
    await middleware(mockReq as Request, mockRes as Response, nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(ForbiddenError));
    expect(mockReq.tenantContext).toBeUndefined();
  });

  it('should block Kitchen staff from accessing Owner-only endpoints', async () => {
    mockReq = {
      user: {
        id: 'kitchen-user-1',
        email: 'cook@abcrestaurant.in',
        displayName: 'Cook',
        platformRole: PlatformRole.RESTAURANT_USER,
        memberships: [
          {
            id: 'mem-k1',
            restaurantId: 'rst-abc',
            role: RestaurantRole.KITCHEN,
            status: 'ACTIVE',
            restaurant: {
              id: 'rst-abc',
              tenantId: 'tenant-abc',
              name: 'ABC Restaurant',
              slug: 'abc-restaurant',
              status: 'ACTIVE',
              subscriptions: [{ id: 's-abc', status: SubscriptionStatus.ACTIVE, endsAt: null }],
            },
          },
        ],
      },
      params: { restaurantId: 'rst-abc' },
    };

    (prisma.restaurant.findFirst as any).mockResolvedValue({
      id: 'rst-abc',
      tenantId: 'tenant-abc',
      name: 'ABC Restaurant',
      slug: 'abc-restaurant',
      subscriptions: [{ id: 's-abc', status: SubscriptionStatus.ACTIVE, endsAt: null }],
    });

    // Guard requiring OWNER role
    const middleware = requireTenant({ allowedRoles: [RestaurantRole.OWNER] });
    await middleware(mockReq as Request, mockRes as Response, nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('should block operational actions when restaurant subscription is expired (BR-04)', async () => {
    mockReq = {
      user: {
        id: 'owner-expired',
        email: 'owner@expired.in',
        displayName: 'Expired Restaurant Owner',
        platformRole: PlatformRole.RESTAURANT_USER,
        memberships: [
          {
            id: 'mem-exp',
            restaurantId: 'rst-expired',
            role: RestaurantRole.OWNER,
            status: 'ACTIVE',
            restaurant: {
              id: 'rst-expired',
              tenantId: 'tenant-exp',
              name: 'Expired Diner',
              slug: 'expired-diner',
              status: 'ACTIVE',
              subscriptions: [{ id: 's-exp', status: SubscriptionStatus.EXPIRED, endsAt: new Date() }],
            },
          },
        ],
      },
      params: { restaurantId: 'rst-expired' },
    };

    (prisma.restaurant.findFirst as any).mockResolvedValue({
      id: 'rst-expired',
      tenantId: 'tenant-exp',
      name: 'Expired Diner',
      slug: 'expired-diner',
      subscriptions: [{ id: 's-exp', status: SubscriptionStatus.EXPIRED, endsAt: new Date() }],
    });

    const middleware = requireTenant({ enforceActiveSubscription: true });
    await middleware(mockReq as Request, mockRes as Response, nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(SubscriptionInactiveError));
  });
});
