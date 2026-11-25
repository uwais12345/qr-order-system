import { GuestSessionStatus, PlatformRole, RestaurantRole } from '@prisma/client';
import { Socket } from 'socket.io';
import { prisma } from '../config/prisma.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { hashGuestToken } from '../utils/token.js';
import { logger } from '../utils/logger.js';
import { RealtimeRooms } from './rooms.js';

export type SocketActor =
  | {
      type: 'STAFF';
      userId: string;
      platformRole: PlatformRole;
      memberships: { restaurantId: string; role: RestaurantRole }[];
    }
  | {
      type: 'GUEST';
      guestSessionId: string;
      restaurantId: string;
      branchId: string;
    };

function extractBearerToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }
  const header = socket.handshake.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return null;
}

function extractGuestToken(socket: Socket): string | null {
  const authGuestToken = socket.handshake.auth?.guestToken;
  if (typeof authGuestToken === 'string' && authGuestToken.trim()) {
    return authGuestToken.trim();
  }
  const headerToken = socket.handshake.headers?.['x-guest-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }
  return null;
}

/**
 * Authenticates Socket.IO handshakes for Staff (JWT) or Guests (capability token)
 * and automatically joins ONLY server-authorized rooms (FR-RT-02).
 */
export async function authenticateSocketConnection(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    const staffToken = extractBearerToken(socket);
    if (staffToken) {
      const payload = verifyAccessToken(staffToken);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          platformRole: true,
          status: true,
          memberships: {
            where: { status: 'ACTIVE' },
            select: { restaurantId: true, role: true },
          },
        },
      });

      if (!user || user.status !== 'ACTIVE') {
        next(new Error('Unauthorized: staff account not found or inactive'));
        return;
      }

      const actor: SocketActor = {
        type: 'STAFF',
        userId: user.id,
        platformRole: user.platformRole,
        memberships: user.memberships,
      };
      socket.data.actor = actor;

      // Join server-authorized restaurant rooms
      for (const m of user.memberships) {
        await socket.join(RealtimeRooms.restaurantKitchen(m.restaurantId));
        if (m.role === RestaurantRole.OWNER) {
          await socket.join(RealtimeRooms.restaurantAdmin(m.restaurantId));
        }
      }

      next();
      return;
    }

    const guestToken = extractGuestToken(socket);
    if (guestToken) {
      const accessTokenHash = hashGuestToken(guestToken);
      const session = await prisma.guestSession.findUnique({
        where: { accessTokenHash },
        include: {
          diningTable: {
            include: {
              branch: {
                select: { id: true, restaurantId: true },
              },
            },
          },
        },
      });

      if (!session || session.status !== GuestSessionStatus.ACTIVE || session.expiresAt <= new Date()) {
        next(new Error('Unauthorized: invalid or expired guest session'));
        return;
      }

      const actor: SocketActor = {
        type: 'GUEST',
        guestSessionId: session.id,
        restaurantId: session.diningTable.branch.restaurantId,
        branchId: session.diningTable.branch.id,
      };
      socket.data.actor = actor;

      await socket.join(RealtimeRooms.guestSession(session.id));
      next();
      return;
    }

    next(new Error('Unauthorized: authentication credentials required'));
  } catch (error) {
    logger.warn({ err: error }, 'Socket authentication failed');
    next(new Error('Unauthorized socket connection'));
  }
}

/**
 * Registers strict server-verified room subscription handlers on connected sockets.
 * Clients cannot join arbitrary rooms supplied by the browser (SRS 7.3).
 */
export function registerSocketHandlers(socket: Socket): void {
  socket.on('subscribe:order', async (payload: { orderId?: string }, ack?: (res: any) => void) => {
    try {
      const orderId = payload?.orderId;
      if (!orderId || typeof orderId !== 'string') {
        ack?.({ ok: false, error: 'Valid orderId is required' });
        return;
      }

      const actor = socket.data.actor as SocketActor | undefined;
      if (!actor) {
        ack?.({ ok: false, error: 'Unauthenticated socket' });
        return;
      }

      if (actor.type === 'GUEST') {
        const order = await prisma.customerOrder.findFirst({
          where: { id: orderId, guestSessionId: actor.guestSessionId },
          select: { id: true },
        });
        if (!order) {
          ack?.({ ok: false, error: 'Forbidden: order does not belong to this guest session' });
          return;
        }
        await socket.join(RealtimeRooms.order(order.id));
        ack?.({ ok: true, room: RealtimeRooms.order(order.id) });
        return;
      }

      if (actor.type === 'STAFF') {
        const order = await prisma.customerOrder.findUnique({
          where: { id: orderId },
          select: { id: true, restaurantId: true },
        });
        const isAuthorized =
          actor.platformRole === PlatformRole.SUPER_ADMIN ||
          (order && actor.memberships.some((m) => m.restaurantId === order.restaurantId));

        if (!order || !isAuthorized) {
          ack?.({ ok: false, error: 'Forbidden: order is outside your restaurant scope' });
          return;
        }

        await socket.join(RealtimeRooms.order(order.id));
        ack?.({ ok: true, room: RealtimeRooms.order(order.id) });
      }
    } catch (error) {
      logger.error({ err: error }, 'Error in subscribe:order handler');
      ack?.({ ok: false, error: 'Failed to subscribe to order' });
    }
  });

  socket.on(
    'subscribe:branch',
    async (payload: { restaurantId?: string; branchId?: string }, ack?: (res: any) => void) => {
      try {
        const actor = socket.data.actor as SocketActor | undefined;
        if (!actor || actor.type !== 'STAFF') {
          ack?.({ ok: false, error: 'Forbidden: staff authentication required' });
          return;
        }

        const { restaurantId, branchId } = payload || {};
        if (!restaurantId || !branchId) {
          ack?.({ ok: false, error: 'restaurantId and branchId are required' });
          return;
        }

        const hasRestaurantAccess =
          actor.platformRole === PlatformRole.SUPER_ADMIN ||
          actor.memberships.some((m) => m.restaurantId === restaurantId);

        if (!hasRestaurantAccess) {
          ack?.({ ok: false, error: 'Forbidden: unauthorized restaurant scope' });
          return;
        }

        const branch = await prisma.branch.findFirst({
          where: { id: branchId, restaurantId },
          select: { id: true },
        });

        if (!branch) {
          ack?.({ ok: false, error: 'Branch not found for this restaurant' });
          return;
        }

        await socket.join(RealtimeRooms.branchKitchen(branch.id));
        ack?.({ ok: true, room: RealtimeRooms.branchKitchen(branch.id) });
      } catch (error) {
        logger.error({ err: error }, 'Error in subscribe:branch handler');
        ack?.({ ok: false, error: 'Failed to subscribe to branch' });
      }
    }
  );
}
