import { z } from 'zod';
import { RestaurantStatus, SubscriptionStatus } from '@prisma/client';
import { safeMediaUrlSchema } from '../../utils/validation.js';

export const createRestaurantSchema = z.object({
  name: z.string().min(2, 'Restaurant name must be at least 2 characters').max(120),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
  tenantName: z.string().min(2).max(120).optional(),
  logoUrl: safeMediaUrlSchema('logo URL').optional().nullable(),
  payAtRestaurantEnabled: z.boolean().optional().default(false),
  ownerName: z.string().min(2, 'Owner name is required').max(100),
  ownerEmail: z.string().email('Valid owner email is required'),
  ownerPassword: z.string().min(8, 'Owner password must be at least 8 characters'),
  branchName: z.string().min(2).max(120).optional().default('Main Branch'),
  addressLine1: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(20).optional(),
  planCode: z.string().min(1).default('BASIC'),
  subscriptionStatus: z.nativeEnum(SubscriptionStatus).optional().default(SubscriptionStatus.ACTIVE),
  subscriptionEndsAt: z.string().datetime().optional(),
});

export const updateRestaurantSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  logoUrl: safeMediaUrlSchema('logo URL').optional().nullable(),
  status: z.nativeEnum(RestaurantStatus).optional(),
  payAtRestaurantEnabled: z.boolean().optional(),
});

export const createPlanSchema = z.object({
  name: z.string().min(2).max(60),
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, 'Plan code must be uppercase alphanumeric with underscores'),
  price: z.number().nonnegative('Price cannot be negative'),
  billingPeriod: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY'),
  featureConfig: z.record(z.unknown()).optional(),
});

export const updatePlanSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  price: z.number().nonnegative('Price cannot be negative').optional(),
  billingPeriod: z.enum(['MONTHLY', 'ANNUAL']).optional(),
  featureConfig: z.record(z.unknown()).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const assignSubscriptionSchema = z.object({
  planId: z.string().uuid('Valid planId is required'),
  status: z.nativeEnum(SubscriptionStatus).default(SubscriptionStatus.ACTIVE),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional().nullable(),
  providerReference: z.string().max(120).optional().nullable(),
});

export const listRestaurantsQuerySchema = z.object({
  status: z.nativeEnum(RestaurantStatus).optional(),
  search: z.string().max(100).optional(),
});

export const auditLogsQuerySchema = z.object({
  restaurantId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type AssignSubscriptionInput = z.infer<typeof assignSubscriptionSchema>;
