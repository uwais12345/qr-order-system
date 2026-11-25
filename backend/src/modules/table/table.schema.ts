import { z } from 'zod';
import { TableStatus } from '@prisma/client';

export const listTablesQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
});

export const createTableSchema = z.object({
  branchId: z.string().uuid('Valid branchId is required'),
  tableCode: z
    .string()
    .min(1, 'Table code is required')
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Table code must be alphanumeric (e.g., T01)'),
  displayName: z.string().min(1).max(60),
  capacity: z.coerce.number().int().min(1).max(50).default(4),
  expiresAt: z.string().datetime().optional(),
});

export const updateTableSchema = z.object({
  displayName: z.string().min(1).max(60).optional(),
  capacity: z.coerce.number().int().min(1).max(50).optional(),
  status: z.nativeEnum(TableStatus).optional(),
});

export const rotateQrSchema = z.object({
  expiresAt: z.string().datetime().optional().nullable(),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type RotateQrInput = z.infer<typeof rotateQrSchema>;
