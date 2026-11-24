import { prisma } from '../../config/prisma.js';
import { verifyPassword } from '../../utils/password.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { LoginInput } from './auth.schema.js';

export class AuthService {
  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            restaurant: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                subscriptions: {
                  take: 1,
                  orderBy: { createdAt: 'desc' },
                  select: {
                    id: true,
                    status: true,
                    endsAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account has been deactivated. Please contact support.');
    }

    const isValidPassword = await verifyPassword(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      platformRole: user.platformRole,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    return {
      tokens: {
        accessToken,
        refreshToken,
      },
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        platformRole: user.platformRole,
        memberships: user.memberships.map((m) => ({
          membershipId: m.id,
          restaurantId: m.restaurantId,
          restaurantName: m.restaurant.name,
          restaurantSlug: m.restaurant.slug,
          role: m.role,
          subscription: m.restaurant.subscriptions[0] || null,
        })),
      },
    };
  }

  async refreshToken(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        platformRole: true,
        status: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedError('User account not found or deactivated');
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      platformRole: user.platformRole,
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        platformRole: true,
        status: true,
        createdAt: true,
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            restaurant: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                logoUrl: true,
                payAtRestaurantEnabled: true,
                subscriptions: {
                  take: 1,
                  orderBy: { createdAt: 'desc' },
                  select: {
                    id: true,
                    status: true,
                    startsAt: true,
                    endsAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    return user;
  }
}

export const authService = new AuthService();
