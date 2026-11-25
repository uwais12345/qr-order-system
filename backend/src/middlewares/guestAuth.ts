import { Request, Response, NextFunction } from 'express';
import { GuestSessionStatus, RestaurantStatus, TableStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { hashGuestToken } from '../utils/token.js';
import { canRestaurantReceiveOrders } from '../utils/subscription.js';
import {
  ForbiddenError,
  SubscriptionInactiveError,
  UnauthorizedError,
} from '../utils/errors.js';

interface RequireGuestSessionOptions {
  enforceOperational?: boolean;
}

function extractGuestToken(req: Request): string | null {
  const headerToken = req.headers['x-guest-token'];
  if (typeof headerToken === 'string' && headerToken.trim().length > 0) {
    return headerToken.trim();
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Guest ')) {
    return authHeader.slice('Guest '.length).trim();
  }

  return null;
}

export function requireGuestSession(options: RequireGuestSessionOptions = {}) {
  const { enforceOperational = true } = options;

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawToken = extractGuestToken(req);
      if (!rawToken) {
        throw new UnauthorizedError('Guest session token is required (x-guest-token header)');
      }

      const accessTokenHash = hashGuestToken(rawToken);
      const session = await prisma.guestSession.findUnique({
        where: { accessTokenHash },
        include: {
          diningTable: {
            include: {
              branch: {
                include: {
                  restaurant: {
                    include: {
                      subscriptions: {
                        take: 1,
                        orderBy: { createdAt: 'desc' },
                        select: { status: true, endsAt: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!session) {
        throw new UnauthorizedError('Invalid guest session token');
      }

      if (session.status !== GuestSessionStatus.ACTIVE || session.expiresAt <= new Date()) {
        throw new UnauthorizedError('Guest session has expired or is closed. Please re-scan table QR.');
      }

      const table = session.diningTable;
      const branch = table.branch;
      const restaurant = branch.restaurant;

      if (table.status !== TableStatus.ACTIVE || branch.status !== 'ACTIVE') {
        throw new ForbiddenError('This dining table or branch is currently unavailable');
      }

      const latestSub = restaurant.subscriptions[0] ?? null;
      const isOperational = canRestaurantReceiveOrders(
        restaurant.status as RestaurantStatus,
        latestSub
      );

      if (enforceOperational && !isOperational) {
        throw new SubscriptionInactiveError(
          'This restaurant is currently not accepting new QR orders.'
        );
      }

      req.guestSession = {
        id: session.id,
        qrTokenId: session.qrTokenId,
        diningTableId: table.id,
        tableCode: table.tableCode,
        tableDisplayName: table.displayName,
        branchId: branch.id,
        branchName: branch.name,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
        restaurantLogoUrl: restaurant.logoUrl,
        payAtRestaurantEnabled: restaurant.payAtRestaurantEnabled,
        customerName: session.customerName,
        customerPhone: session.customerPhone,
        isOperational,
        expiresAt: session.expiresAt,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
