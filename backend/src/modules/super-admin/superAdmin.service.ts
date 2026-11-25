import {
  PlatformRole,
  Prisma,
  RestaurantRole,
  RestaurantStatus,
  SubscriptionStatus,
  TaxCalculationType,
} from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { hashPassword } from '../../utils/password.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { recordAuditLog } from '../../utils/audit.js';
import {
  AssignSubscriptionInput,
  CreatePlanInput,
  CreateRestaurantInput,
  UpdatePlanInput,
  UpdateRestaurantInput,
} from './superAdmin.schema.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class SuperAdminService {
  async getDashboardMetrics() {
    const [
      totalRestaurants,
      activeRestaurants,
      totalOrders,
      verifiedRevenueAgg,
      subscriptionsByStatus,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.restaurant.count(),
      prisma.restaurant.count({ where: { status: RestaurantStatus.ACTIVE } }),
      prisma.customerOrder.count(),
      prisma.payment.aggregate({
        where: { status: 'SUCCEEDED' },
        _sum: { amount: true },
      }),
      prisma.restaurantSubscription.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      prisma.auditLog.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          actorUser: { select: { id: true, email: true, displayName: true } },
          restaurant: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    return {
      restaurants: {
        total: totalRestaurants,
        active: activeRestaurants,
        inactive: totalRestaurants - activeRestaurants,
      },
      orders: {
        total: totalOrders,
      },
      verifiedPaymentRevenue: verifiedRevenueAgg._sum.amount?.toString() ?? '0.00',
      subscriptionsByStatus: subscriptionsByStatus.map((s) => ({
        status: s.status,
        count: s._count.id,
      })),
      recentAuditLogs,
    };
  }

  async listRestaurants(filters: { status?: RestaurantStatus; search?: string }) {
    const where: Prisma.RestaurantWhereInput = {};
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { slug: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return prisma.restaurant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: { select: { id: true, name: true, status: true } },
        branches: { select: { id: true, name: true, city: true, status: true } },
        subscriptions: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { plan: { select: { id: true, name: true, code: true, price: true } } },
        },
        memberships: {
          where: { role: RestaurantRole.OWNER, status: 'ACTIVE' },
          include: { user: { select: { id: true, email: true, displayName: true } } },
        },
        _count: { select: { orders: true, menuCategories: true } },
      },
    });
  }

  async getRestaurantById(restaurantId: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        tenant: true,
        branches: {
          include: {
            _count: { select: { tables: true } },
          },
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          include: { plan: true },
        },
        memberships: {
          include: {
            user: { select: { id: true, email: true, displayName: true, status: true } },
          },
        },
        taxRules: true,
        auditLogs: {
          take: 25,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!restaurant) {
      throw new NotFoundError('Restaurant not found');
    }

    return restaurant;
  }

  async createRestaurant(input: CreateRestaurantInput, actorUserId: string) {
    const slug = input.slug || slugify(input.name);
    const normalizedEmail = input.ownerEmail.toLowerCase().trim();

    const [existingSlug, existingUser, plan] = await Promise.all([
      prisma.restaurant.findUnique({ where: { slug } }),
      prisma.user.findUnique({ where: { email: normalizedEmail } }),
      prisma.subscriptionPlan.findUnique({ where: { code: input.planCode.toUpperCase() } }),
    ]);

    if (existingSlug) {
      throw new ConflictError(`Restaurant slug "${slug}" is already in use`);
    }
    if (existingUser) {
      throw new ConflictError(`Owner email "${normalizedEmail}" is already registered`);
    }
    if (!plan) {
      throw new NotFoundError(`Subscription plan "${input.planCode}" not found`);
    }

    const passwordHash = await hashPassword(input.ownerPassword);
    const startsAt = new Date();
    const endsAt = input.subscriptionEndsAt
      ? new Date(input.subscriptionEndsAt)
      : new Date(new Date().setMonth(startsAt.getMonth() + (plan.billingPeriod === 'ANNUAL' ? 12 : 1)));

    return prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.tenantName || input.name,
        },
      });

      const restaurant = await tx.restaurant.create({
        data: {
          tenantId: tenant.id,
          name: input.name,
          slug,
          logoUrl: input.logoUrl ?? null,
          payAtRestaurantEnabled: input.payAtRestaurantEnabled,
          status: RestaurantStatus.ACTIVE,
        },
      });

      const branch = await tx.branch.create({
        data: {
          restaurantId: restaurant.id,
          name: input.branchName,
          addressLine1: input.addressLine1,
          city: input.city,
          state: input.state,
          pincode: input.pincode,
        },
      });

      const ownerUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          displayName: input.ownerName,
          platformRole: PlatformRole.RESTAURANT_USER,
        },
      });

      await tx.restaurantMembership.create({
        data: {
          restaurantId: restaurant.id,
          userId: ownerUser.id,
          role: RestaurantRole.OWNER,
        },
      });

      const subscription = await tx.restaurantSubscription.create({
        data: {
          restaurantId: restaurant.id,
          planId: plan.id,
          status: input.subscriptionStatus,
          startsAt,
          endsAt,
        },
      });

      // Seed default 5% GST rules (2.5% CGST + 2.5% SGST)
      await tx.taxRule.createMany({
        data: [
          {
            restaurantId: restaurant.id,
            branchId: branch.id,
            name: 'CGST',
            rate: 2.5,
            calculationType: TaxCalculationType.PERCENTAGE,
          },
          {
            restaurantId: restaurant.id,
            branchId: branch.id,
            name: 'SGST',
            rate: 2.5,
            calculationType: TaxCalculationType.PERCENTAGE,
          },
        ],
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId: restaurant.id,
        action: 'RESTAURANT_CREATED',
        entityType: 'Restaurant',
        entityId: restaurant.id,
        metadata: {
          name: restaurant.name,
          slug: restaurant.slug,
          planCode: plan.code,
          ownerEmail: ownerUser.email,
        },
      });

      return {
        restaurant,
        branch,
        owner: {
          id: ownerUser.id,
          email: ownerUser.email,
          displayName: ownerUser.displayName,
        },
        subscription,
      };
    });
  }

  async updateRestaurant(
    restaurantId: string,
    input: UpdateRestaurantInput,
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
          status: input.status,
          payAtRestaurantEnabled: input.payAtRestaurantEnabled,
        },
      });

      const action =
        input.status && input.status !== existing.status
          ? 'RESTAURANT_STATUS_CHANGED'
          : 'RESTAURANT_UPDATED';

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action,
        entityType: 'Restaurant',
        entityId: restaurantId,
        metadata: {
          previousStatus: existing.status,
          newStatus: updated.status,
          changes: input as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  async listPlans() {
    return prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' },
      include: {
        _count: { select: { subscriptions: true } },
      },
    });
  }

  async createPlan(input: CreatePlanInput, actorUserId: string) {
    const existing = await prisma.subscriptionPlan.findUnique({ where: { code: input.code } });
    if (existing) {
      throw new ConflictError(`Plan code "${input.code}" already exists`);
    }

    return prisma.$transaction(async (tx) => {
      const plan = await tx.subscriptionPlan.create({
        data: {
          name: input.name,
          code: input.code,
          price: input.price,
          billingPeriod: input.billingPeriod,
          featureConfig: (input.featureConfig ?? {}) as Prisma.InputJsonValue,
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        action: 'SUBSCRIPTION_PLAN_CREATED',
        entityType: 'SubscriptionPlan',
        entityId: plan.id,
        metadata: { code: plan.code, price: plan.price.toString() },
      });

      return plan;
    });
  }

  async updatePlan(planId: string, input: UpdatePlanInput, actorUserId: string) {
    const existing = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!existing) {
      throw new NotFoundError('Subscription plan not found');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.subscriptionPlan.update({
        where: { id: planId },
        data: {
          name: input.name,
          price: input.price,
          billingPeriod: input.billingPeriod,
          featureConfig: input.featureConfig as Prisma.InputJsonValue | undefined,
          status: input.status,
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        action: 'SUBSCRIPTION_PLAN_UPDATED',
        entityType: 'SubscriptionPlan',
        entityId: planId,
        metadata: {
          previousPrice: existing.price.toString(),
          newPrice: updated.price.toString(),
        },
      });

      return updated;
    });
  }

  async assignSubscription(
    restaurantId: string,
    input: AssignSubscriptionInput,
    actorUserId: string
  ) {
    const [restaurant, plan] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId } }),
      prisma.subscriptionPlan.findUnique({ where: { id: input.planId } }),
    ]);

    if (!restaurant) {
      throw new NotFoundError('Restaurant not found');
    }
    if (!plan) {
      throw new NotFoundError('Subscription plan not found');
    }

    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const endsAt =
      input.endsAt === null
        ? null
        : input.endsAt
        ? new Date(input.endsAt)
        : new Date(new Date(startsAt).setMonth(startsAt.getMonth() + (plan.billingPeriod === 'ANNUAL' ? 12 : 1)));

    return prisma.$transaction(async (tx) => {
      if (input.status === SubscriptionStatus.ACTIVE || input.status === SubscriptionStatus.TRIAL) {
        await tx.restaurantSubscription.updateMany({
          where: {
            restaurantId,
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
          },
          data: { status: SubscriptionStatus.CANCELLED },
        });
      }

      const subscription = await tx.restaurantSubscription.create({
        data: {
          restaurantId,
          planId: plan.id,
          status: input.status,
          startsAt,
          endsAt,
          providerReference: input.providerReference ?? null,
        },
        include: { plan: true },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'SUBSCRIPTION_ASSIGNED',
        entityType: 'RestaurantSubscription',
        entityId: subscription.id,
        metadata: {
          planCode: plan.code,
          status: subscription.status,
          endsAt: subscription.endsAt?.toISOString() ?? null,
        },
      });

      return subscription;
    });
  }

  async listAuditLogs(query: { restaurantId?: string; limit: number; offset: number }) {
    const where: Prisma.AuditLogWhereInput = query.restaurantId
      ? { restaurantId: query.restaurantId }
      : {};

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: 'desc' },
        include: {
          actorUser: { select: { id: true, email: true, displayName: true } },
          restaurant: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { items, total, limit: query.limit, offset: query.offset };
  }
}

export const superAdminService = new SuperAdminService();
