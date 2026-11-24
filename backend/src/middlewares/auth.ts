import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { UnauthorizedError } from '../utils/errors.js';

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        platformRole: true,
        status: true,
        memberships: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            restaurantId: true,
            role: true,
            status: true,
            restaurant: {
              select: {
                id: true,
                tenantId: true,
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

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedError('User account not found or deactivated');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
