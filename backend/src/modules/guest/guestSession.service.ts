import {
  CartStatus,
  GuestSessionStatus,
  ItemAvailability,
  PaymentMethod,
  RestaurantStatus,
  TableStatus,
} from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  SubscriptionInactiveError,
} from '../../utils/errors.js';
import { canRestaurantReceiveOrders } from '../../utils/subscription.js';
import { generateSecureToken, hashGuestToken, hashQrToken } from '../../utils/token.js';
import { GuestSessionContext } from '../../types/express.js';
import { CreateGuestSessionInput } from './guest.schema.js';

const GUEST_SESSION_TTL_HOURS = 12;

export class GuestSessionService {
  async createSessionFromQr(input: CreateGuestSessionInput) {
    const tokenHash = hashQrToken(input.token.trim());
    const now = new Date();

    const qrToken = await prisma.qRToken.findUnique({
      where: { tokenHash },
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

    if (!qrToken || qrToken.status !== 'ACTIVE' || qrToken.revokedAt) {
      throw new NotFoundError('Invalid or revoked table QR code');
    }

    if (qrToken.expiresAt && qrToken.expiresAt <= now) {
      throw new BadRequestError('This table QR code has expired');
    }

    const table = qrToken.diningTable;
    const branch = table.branch;
    const restaurant = branch.restaurant;

    if (input.restaurantSlug && input.restaurantSlug !== restaurant.slug) {
      throw new BadRequestError('QR token does not match the specified restaurant');
    }

    if (input.tableCode && input.tableCode.trim().toUpperCase() !== table.tableCode) {
      throw new BadRequestError('QR token does not match the specified table');
    }

    if (table.status !== TableStatus.ACTIVE || branch.status !== 'ACTIVE') {
      throw new ForbiddenError('This dining table or branch is currently unavailable');
    }

    const latestSub = restaurant.subscriptions[0] ?? null;
    if (!canRestaurantReceiveOrders(restaurant.status as RestaurantStatus, latestSub, now)) {
      throw new SubscriptionInactiveError(
        'This restaurant is currently not accepting QR orders.'
      );
    }

    const rawAccessToken = generateSecureToken(32);
    const accessTokenHash = hashGuestToken(rawAccessToken);
    const expiresAt = new Date(now.getTime() + GUEST_SESSION_TTL_HOURS * 60 * 60 * 1000);

    const session = await prisma.$transaction(async (tx) => {
      const created = await tx.guestSession.create({
        data: {
          qrTokenId: qrToken.id,
          diningTableId: table.id,
          accessTokenHash,
          status: GuestSessionStatus.ACTIVE,
          expiresAt,
        },
      });

      await tx.cart.create({
        data: {
          guestSessionId: created.id,
          status: CartStatus.ACTIVE,
        },
      });

      return created;
    });

    const availablePaymentMethods = restaurant.payAtRestaurantEnabled
      ? [PaymentMethod.ONLINE, PaymentMethod.PAY_AT_RESTAURANT]
      : [PaymentMethod.ONLINE];

    return {
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
      accessToken: rawAccessToken,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        logoUrl: restaurant.logoUrl,
        payAtRestaurantEnabled: restaurant.payAtRestaurantEnabled,
      },
      branch: {
        id: branch.id,
        name: branch.name,
      },
      table: {
        id: table.id,
        tableCode: table.tableCode,
        displayName: table.displayName,
      },
      availablePaymentMethods,
    };
  }

  async getGuestMenu(guestSession: GuestSessionContext) {
    const now = new Date();

    const [categories, taxRules] = await Promise.all([
      prisma.menuCategory.findMany({
        where: {
          restaurantId: guestSession.restaurantId,
          isActive: true,
          OR: [{ branchId: null }, { branchId: guestSession.branchId }],
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          items: {
            where: {
              availabilityStatus: { not: ItemAvailability.UNAVAILABLE },
            },
            orderBy: { name: 'asc' },
            include: {
              modifierGroups: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  modifierGroup: {
                    include: {
                      options: {
                        where: { isAvailable: true },
                        orderBy: { sortOrder: 'asc' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.taxRule.findMany({
        where: {
          restaurantId: guestSession.restaurantId,
          isActive: true,
          effectiveFrom: { lte: now },
          AND: [
            { OR: [{ branchId: null }, { branchId: guestSession.branchId }] },
            { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
          ],
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const availablePaymentMethods = guestSession.payAtRestaurantEnabled
      ? [PaymentMethod.ONLINE, PaymentMethod.PAY_AT_RESTAURANT]
      : [PaymentMethod.ONLINE];

    return {
      restaurant: {
        id: guestSession.restaurantId,
        name: guestSession.restaurantName,
        slug: guestSession.restaurantSlug,
        logoUrl: guestSession.restaurantLogoUrl,
        payAtRestaurantEnabled: guestSession.payAtRestaurantEnabled,
      },
      branch: {
        id: guestSession.branchId,
        name: guestSession.branchName,
      },
      table: {
        id: guestSession.diningTableId,
        tableCode: guestSession.tableCode,
        displayName: guestSession.tableDisplayName,
      },
      availablePaymentMethods,
      categories: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        sortOrder: cat.sortOrder,
        items: cat.items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          imageUrl: item.imageUrl,
          price: item.price.toString(),
          isVeg: item.isVeg,
          availabilityStatus: item.availabilityStatus,
          isOrderable: item.availabilityStatus === ItemAvailability.AVAILABLE,
          modifierGroups: item.modifierGroups.map((mg) => ({
            id: mg.modifierGroup.id,
            name: mg.modifierGroup.name,
            minSelect: mg.modifierGroup.minSelect,
            maxSelect: mg.modifierGroup.maxSelect,
            isRequired: mg.modifierGroup.isRequired,
            options: mg.modifierGroup.options.map((opt) => ({
              id: opt.id,
              name: opt.name,
              priceDelta: opt.priceDelta.toString(),
            })),
          })),
        })),
      })),
      taxRules: taxRules.map((tr) => ({
        id: tr.id,
        name: tr.name,
        rate: tr.rate.toString(),
        calculationType: tr.calculationType,
      })),
    };
  }
}

export const guestSessionService = new GuestSessionService();
