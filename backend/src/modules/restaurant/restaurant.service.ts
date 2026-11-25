import { PlatformRole, Prisma, RestaurantRole } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { hashPassword } from '../../utils/password.js';
import { recordAuditLog } from '../../utils/audit.js';
import { isSubscriptionCurrentlyActive } from '../../utils/subscription.js';
import {
  CreateBranchInput,
  CreateStaffMemberInput,
  UpdateBranchInput,
  UpdateRestaurantProfileInput,
  UpdateStaffMemberInput,
} from './restaurant.schema.js';

export class RestaurantService {
  async getProfile(restaurantId: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        branches: {
          orderBy: { createdAt: 'asc' },
          include: {
            _count: { select: { tables: true } },
          },
        },
        subscriptions: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { plan: true },
        },
        taxRules: {
          where: { isActive: true },
        },
      },
    });

    if (!restaurant) {
      throw new NotFoundError('Restaurant not found');
    }

    const latestSub = restaurant.subscriptions[0] ?? null;

    return {
      ...restaurant,
      currentSubscription: latestSub,
      isSubscriptionActive: isSubscriptionCurrentlyActive(latestSub),
    };
  }

  async updateProfile(
    restaurantId: string,
    input: UpdateRestaurantProfileInput,
    actorUserId: string
  ) {
    const existing = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!existing) {
      throw new NotFoundError('Restaurant not found');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.restaurant.update({
        where: { id: restaurantId },
        data: {
          name: input.name,
          logoUrl: input.logoUrl,
          payAtRestaurantEnabled: input.payAtRestaurantEnabled,
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'RESTAURANT_PROFILE_UPDATED',
        entityType: 'Restaurant',
        entityId: restaurantId,
        metadata: input as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  async listBranches(restaurantId: string) {
    return prisma.branch.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { tables: true } },
      },
    });
  }

  async createBranch(restaurantId: string, input: CreateBranchInput, actorUserId: string) {
    const [branchCount, latestSub] = await Promise.all([
      prisma.branch.count({ where: { restaurantId } }),
      prisma.restaurantSubscription.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      }),
    ]);

    const featureConfig = latestSub?.plan?.featureConfig as { maxBranches?: number } | null;
    if (featureConfig?.maxBranches && branchCount >= featureConfig.maxBranches) {
      throw new ForbiddenError(
        `Your current plan allows a maximum of ${featureConfig.maxBranches} branch(es)`
      );
    }

    return prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          restaurantId,
          name: input.name,
          addressLine1: input.addressLine1,
          city: input.city,
          state: input.state,
          pincode: input.pincode,
          timezone: input.timezone,
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'BRANCH_CREATED',
        entityType: 'Branch',
        entityId: branch.id,
        metadata: { name: branch.name, city: branch.city },
      });

      return branch;
    });
  }

  async updateBranch(
    restaurantId: string,
    branchId: string,
    input: UpdateBranchInput,
    actorUserId: string
  ) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, restaurantId },
    });

    if (!branch) {
      throw new NotFoundError('Branch not found for this restaurant');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.branch.update({
        where: { id: branchId },
        data: {
          name: input.name,
          addressLine1: input.addressLine1,
          city: input.city,
          state: input.state,
          pincode: input.pincode,
          timezone: input.timezone,
          status: input.status,
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'BRANCH_UPDATED',
        entityType: 'Branch',
        entityId: branchId,
        metadata: input as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  async listStaff(restaurantId: string) {
    return prisma.restaurantMembership.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async createStaffMember(
    restaurantId: string,
    input: CreateStaffMemberInput,
    actorUserId: string
  ) {
    const normalizedEmail = input.email.toLowerCase().trim();
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (existingUser) {
      const existingMembership = await prisma.restaurantMembership.findUnique({
        where: {
          restaurantId_userId: { restaurantId, userId: existingUser.id },
        },
      });
      if (existingMembership) {
        throw new ConflictError('User is already a member of this restaurant');
      }
      throw new ConflictError('Email is already registered in the platform');
    }

    const passwordHash = await hashPassword(input.password);

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          displayName: input.displayName,
          platformRole: PlatformRole.RESTAURANT_USER,
        },
      });

      const membership = await tx.restaurantMembership.create({
        data: {
          restaurantId,
          userId: user.id,
          role: input.role,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              status: true,
            },
          },
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'STAFF_MEMBER_CREATED',
        entityType: 'RestaurantMembership',
        entityId: membership.id,
        metadata: { email: user.email, role: membership.role },
      });

      return membership;
    });
  }

  async updateStaffMember(
    restaurantId: string,
    membershipId: string,
    input: UpdateStaffMemberInput,
    actorUserId: string
  ) {
    const membership = await prisma.restaurantMembership.findFirst({
      where: { id: membershipId, restaurantId },
    });

    if (!membership) {
      throw new NotFoundError('Staff membership not found for this restaurant');
    }

    if (
      membership.role === RestaurantRole.OWNER &&
      (input.status === 'INACTIVE' || (input.role && input.role !== RestaurantRole.OWNER))
    ) {
      const activeOwnersCount = await prisma.restaurantMembership.count({
        where: { restaurantId, role: RestaurantRole.OWNER, status: 'ACTIVE' },
      });
      if (activeOwnersCount <= 1) {
        throw new ForbiddenError('Cannot remove or deactivate the last active restaurant owner');
      }
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.restaurantMembership.update({
        where: { id: membershipId },
        data: {
          role: input.role,
          status: input.status,
        },
        include: {
          user: {
            select: { id: true, email: true, displayName: true, status: true },
          },
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'STAFF_MEMBER_UPDATED',
        entityType: 'RestaurantMembership',
        entityId: membershipId,
        metadata: input as Prisma.InputJsonValue,
      });

      return updated;
    });
  }
}

export const restaurantService = new RestaurantService();
