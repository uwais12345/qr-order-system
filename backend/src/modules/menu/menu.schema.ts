import { z } from 'zod';
import { ItemAvailability, TaxCalculationType } from '@prisma/client';
import { safeMediaUrlSchema } from '../../utils/validation.js';

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(80),
  branchId: z.string().uuid().optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const reorderCategoriesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int().min(0),
      })
    )
    .min(1),
});

export const deleteCategoryQuerySchema = z.object({
  reassignToCategoryId: z.string().uuid().optional(),
});

export const createMenuItemSchema = z.object({
  categoryId: z.string().uuid('Valid categoryId is required'),
  name: z.string().min(1, 'Item name is required').max(120),
  description: z.string().max(600).optional().nullable(),
  imageUrl: safeMediaUrlSchema('image URL').or(z.literal('')).optional().nullable(),
  price: z.number().nonnegative('Price cannot be negative'),
  isVeg: z.boolean().default(false),
  availabilityStatus: z.nativeEnum(ItemAvailability).default(ItemAvailability.AVAILABLE),
  modifierGroupIds: z.array(z.string().uuid()).optional().default([]),
});

export const updateMenuItemSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(600).optional().nullable(),
  imageUrl: safeMediaUrlSchema('image URL').or(z.literal('')).optional().nullable(),
  price: z.number().nonnegative('Price cannot be negative').optional(),
  isVeg: z.boolean().optional(),
  availabilityStatus: z.nativeEnum(ItemAvailability).optional(),
  modifierGroupIds: z.array(z.string().uuid()).optional(),
});

export const updateItemAvailabilitySchema = z.object({
  availabilityStatus: z.nativeEnum(ItemAvailability),
});

export const modifierOptionInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  priceDelta: z.number().nonnegative('Price delta cannot be negative').default(0),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const createModifierGroupSchema = z
  .object({
    name: z.string().min(1).max(80),
    minSelect: z.number().int().min(0).default(0),
    maxSelect: z.number().int().min(1).default(1),
    isRequired: z.boolean().default(false),
    options: z.array(modifierOptionInputSchema).min(1, 'At least one option is required'),
  })
  .refine((data) => data.maxSelect >= data.minSelect, {
    message: 'maxSelect must be greater than or equal to minSelect',
    path: ['maxSelect'],
  });

export const updateModifierGroupSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    minSelect: z.number().int().min(0).optional(),
    maxSelect: z.number().int().min(1).optional(),
    isRequired: z.boolean().optional(),
    options: z.array(modifierOptionInputSchema).min(1).optional(),
  })
  .refine(
    (data) =>
      data.minSelect === undefined ||
      data.maxSelect === undefined ||
      data.maxSelect >= data.minSelect,
    {
      message: 'maxSelect must be greater than or equal to minSelect',
      path: ['maxSelect'],
    }
  );

export const createTaxRuleSchema = z
  .object({
    name: z.string().min(1).max(60),
    branchId: z.string().uuid().optional().nullable(),
    rate: z.number().nonnegative('Tax rate cannot be negative').max(100),
    calculationType: z.nativeEnum(TaxCalculationType).default(TaxCalculationType.PERCENTAGE),
    isActive: z.boolean().default(true),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().optional().nullable(),
  })
  .refine(
    (data) =>
      !data.effectiveFrom ||
      !data.effectiveTo ||
      new Date(data.effectiveTo) > new Date(data.effectiveFrom),
    {
      message: 'effectiveTo must be later than effectiveFrom',
      path: ['effectiveTo'],
    }
  );

export const updateTaxRuleSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  rate: z.number().nonnegative().max(100).optional(),
  calculationType: z.nativeEnum(TaxCalculationType).optional(),
  isActive: z.boolean().optional(),
  effectiveTo: z.string().datetime().optional().nullable(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type CreateModifierGroupInput = z.infer<typeof createModifierGroupSchema>;
export type UpdateModifierGroupInput = z.infer<typeof updateModifierGroupSchema>;
export type CreateTaxRuleInput = z.infer<typeof createTaxRuleSchema>;
export type UpdateTaxRuleInput = z.infer<typeof updateTaxRuleSchema>;
