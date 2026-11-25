import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuestSessionStatus, PlatformRole, RestaurantRole } from '@prisma/client';
import { prisma } from '../../src/config/prisma.js';
import { generateAccessToken } from '../../src/utils/jwt.js';
import { hashGuestToken } from '../../src/utils/token.js';
import {
  authenticateSocketConnection,
  registerSocketHandlers,
} from '../../src/realtime/socketAuth.js';
import { RealtimeRooms } from '../../src/realtime/rooms.js';

vi.mock('../../src/config/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    guestSession: { findUnique: vi.fn() },
    customerOrder: { findFirst: vi.fn(), findUnique: vi.fn() },
    branch: { findFirst: vi.fn() },
  },
}));

function createMockSocket(auth: Record<string, unknown> = {}) {
  const listeners = new Map<string, (...args: any[]) => any>();
  return {
    id: 'sock-1',
    handshake: { auth, headers: {} },
    data: {} as Record<string, any>,
    join: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, fn: (...args: any[]) => any) => {
      listeners.set(event, fn);
    }),
    emitEvent: async (event: string, payload: unknown) => {
      const handler = listeners.get(event);
      let ackResult: any;
      if (handler) {
        await handler(payload, (res: any) => {
          ackResult = res;
        });
      }
      return ackResult;
    },
  };
}

describe('Socket.IO Authentication & Room Authorization (FR-RT-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated socket handshakes', async () => {
    const socket = createMockSocket({});
    const next = vi.fn();

    await authenticateSocketConnection(socket as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('authenticates staff JWT and joins ONLY authorized restaurant kitchen/admin rooms', async () => {
    const token = generateAccessToken({
      userId: 'owner-1',
      email: 'owner@abc.in',
      platformRole: PlatformRole.RESTAURANT_USER,
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'owner-1',
      platformRole: PlatformRole.RESTAURANT_USER,
      status: 'ACTIVE',
      memberships: [{ restaurantId: 'rst-abc', role: RestaurantRole.OWNER }],
    });

    const socket = createMockSocket({ token });
    const next = vi.fn();

    await authenticateSocketConnection(socket as any, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.join).toHaveBeenCalledWith(RealtimeRooms.restaurantKitchen('rst-abc'));
    expect(socket.join).toHaveBeenCalledWith(RealtimeRooms.restaurantAdmin('rst-abc'));
  });

  it('authenticates guest capability token and blocks subscribing to another session order', async () => {
    const rawGuestToken = 'guest-tok-999';
    (prisma.guestSession.findUnique as any).mockResolvedValue({
      id: 'gs-1',
      accessTokenHash: hashGuestToken(rawGuestToken),
      status: GuestSessionStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 60_000),
      diningTable: {
        branch: { id: 'br-1', restaurantId: 'rst-abc' },
      },
    });

    const socket = createMockSocket({ guestToken: rawGuestToken });
    const next = vi.fn();

    await authenticateSocketConnection(socket as any, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.join).toHaveBeenCalledWith(RealtimeRooms.guestSession('gs-1'));

    registerSocketHandlers(socket as any);

    // Attempt to join an order belonging to a different guest session
    (prisma.customerOrder.findFirst as any).mockResolvedValueOnce(null);
    const forbiddenAck = await socket.emitEvent('subscribe:order', { orderId: 'other-order-id' });
    expect(forbiddenAck.ok).toBe(false);
    expect(socket.join).not.toHaveBeenCalledWith(RealtimeRooms.order('other-order-id'));

    // Attempt to join a kitchen branch room as guest
    const branchAck = await socket.emitEvent('subscribe:branch', {
      restaurantId: 'rst-abc',
      branchId: 'br-1',
    });
    expect(branchAck.ok).toBe(false);
    expect(socket.join).not.toHaveBeenCalledWith(RealtimeRooms.branchKitchen('br-1'));
  });
});
