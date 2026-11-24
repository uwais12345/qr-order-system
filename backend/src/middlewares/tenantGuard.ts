import { Request, Response, NextFunction } from 'express';
import { RestaurantRole, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ForbiddenError, NotFoundError, SubscriptionInactiveError, UnauthorizedError } from '../utils/errors.js';

interface RequireTenantOptions {
  allowedRoles?: RestaurantRole[];
  enforceActiveSubscription?: boolean;
}

export function requireTenant(options: RequireTenantOptions = {}) {
  const { allowedRoles, enforceActiveSubscription = false } = options;

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required before tenant scoping');
      }

      // 1. Resolve restaurant identifier from URL params, query, or body
      const restaurantParam =
        req.params?.restaurantId ||
        req.params?.restaurantSlug ||
        req.query?.restaurantId ||
        req.query?.restaurantSlug ||
        req.body?.restaurantId ||
        req.body?.restaurantSlug;

      if (!restaurantParam || typeof restaurantParam !== 'string') {
        throw new ForbiddenError('Restaurant scope parameter is required');
      }

      // 2. Resolve restaurant record
      const restaurant = await prisma.restaurant.findFirst({
        where: {
          OR: [{ id: restaurantParam }, { slug: restaurantParam }],
        },
        include: {
          subscriptions: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { id: true, status: true, endsAt: true },
          },
        },
      });

      if (!restaurant) {
        throw new NotFoundError(`Restaurant not found for identifier: ${restaurantParam}`);
      }

      const activeSub = restaurant.subscriptions[0];
      const isSubscriptionActive = activeSub?.status === SubscriptionStatus.ACTIVE;

      const branchId =
        req.params?.branchId ||
        (typeof req.query?.branchId === 'string' ? req.query.branchId : undefined) ||
        req.body?.branchId;

      // 3. Super Admin bypass: platform operator can access all tenant contexts
      if (req.user.platformRole === 'SUPER_ADMIN') {
        req.tenantContext = {
          tenantId: restaurant.tenantId,
          restaurantId: restaurant.id,
          branchId,
          userRole: 'SUPER_ADMIN',
          subscriptionStatus: activeSub?.status || SubscriptionStatus.EXPIRED,
          isSubscriptionActive,
        };
        next();
        return;
      }

      // 4. Match restaurant membership
      const membership = req.user.memberships.find(
        (m) => m.restaurantId === restaurant.id && m.status === 'ACTIVE'
      );

      if (!membership) {
        throw new ForbiddenError('You do not have access to this restaurant');
      }

      // 5. Role check (OWNER vs KITCHEN)
      if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
        throw new ForbiddenError(
          `Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`
        );
      }

      // 6. Subscription enforcement (BR-04: Block operational actions if subscription is inactive)
      if (enforceActiveSubscription && !isSubscriptionActive) {
        throw new SubscriptionInactiveError(
          `Restaurant subscription is currently ${activeSub?.status || 'INACTIVE'}. This action cannot be performed.`
        );
      }

      req.tenantContext = {
        tenantId: restaurant.tenantId,
        restaurantId: restaurant.id,
        branchId,
        userRole: membership.role,
        subscriptionStatus: activeSub?.status || SubscriptionStatus.EXPIRED,
        isSubscriptionActive,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
