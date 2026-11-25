import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';
import { isValidIndianMobile } from '../../utils/phone.js';

export const createGuestSessionSchema = z.object({
  token: z.string().min(1, 'QR token is required'),
  restaurantSlug: z.string().min(1).optional(),
  tableCode: z.string().min(1).optional(),
});

export const addCartItemSchema = z.object({
  menuItemId: z.string().uuid('Valid menuItemId is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(50).default(1),
  modifierOptionIds: z.array(z.string().uuid()).optional().default([]),
  notes: z.string().max(300).optional().default(''),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(50).optional(),
  notes: z.string().max(300).optional(),
});

export const placeOrderSchema = z.object({
  customerName: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(100),
  customerPhone: z
    .string()
    .trim()
    .refine((val) => isValidIndianMobile(val), 'Please enter a valid 10-digit Indian mobile number'),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.ONLINE),
  notes: z.string().max(400).optional(),
  idempotencyKey: z.string().min(8).max(120).optional(),
  acceptPriceChanges: z.boolean().optional().default(false),
});

export type CreateGuestSessionInput = z.infer<typeof createGuestSessionSchema>;
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
