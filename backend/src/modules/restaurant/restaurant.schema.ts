import { z } from 'zod';
import { RestaurantRole } from '@prisma/client';
import { safeMediaUrlSchema } from '../../utils/validation.js';

export const updateRestaurantProfileSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  logoUrl: safeMediaUrlSchema('logo URL').optional().nullable(),
  payAtRestaurantEnabled: z.boolean().optional(),
});

export const createBranchSchema = z.object({
  name: z.string().min(2, 'Branch name is required').max(120),
  addressLine1: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(20).optional(),
  timezone: z.string().max(60).optional().default('Asia/Kolkata'),
});

export const updateBranchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  addressLine1: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  pincode: z.string().max(20).optional().nullable(),
  timezone: z.string().max(60).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const createStaffMemberSchema = z.object({
  displayName: z.string().min(2).max(100),
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.nativeEnum(RestaurantRole).default(RestaurantRole.KITCHEN),
});

export const updateStaffMemberSchema = z.object({
  role: z.nativeEnum(RestaurantRole).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export type UpdateRestaurantProfileInput = z.infer<typeof updateRestaurantProfileSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type CreateStaffMemberInput = z.infer<typeof createStaffMemberSchema>;
export type UpdateStaffMemberInput = z.infer<typeof updateStaffMemberSchema>;
