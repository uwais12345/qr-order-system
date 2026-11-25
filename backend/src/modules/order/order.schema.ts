import { z } from 'zod';
import { OrderStatus } from '@prisma/client';

export const listOrdersQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  tableId: z.string().uuid().optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  activeOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const updateOrderStatusSchema = z.object({
  toStatus: z.nativeEnum(OrderStatus),
  reason: z.string().trim().max(300).optional(),
  estimatedPrepMinutes: z.coerce.number().int().min(1).max(180).optional(),
});

export const updateOrderEstimateSchema = z.object({
  estimatedPrepMinutes: z.coerce.number().int().min(1).max(180),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type UpdateOrderEstimateInput = z.infer<typeof updateOrderEstimateSchema>;
