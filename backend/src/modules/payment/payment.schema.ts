import { z } from 'zod';

export const createGatewayOrderSchema = z.object({
  orderId: z.string().uuid('Valid orderId is required'),
  idempotencyKey: z.string().min(8).max(120).optional(),
});

export const verifyGatewayPaymentSchema = z.object({
  orderId: z.string().uuid('Valid orderId is required'),
  razorpayOrderId: z.string().min(1, 'razorpayOrderId is required'),
  razorpayPaymentId: z.string().min(1, 'razorpayPaymentId is required'),
  razorpaySignature: z.string().min(1, 'razorpaySignature is required'),
});

export const settleOfflinePaymentSchema = z.object({
  channel: z.enum(['CASH', 'UPI_COUNTER', 'CARD_POS']).default('CASH'),
  reference: z.string().trim().max(120).optional(),
});

export const paymentSummaryQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
});

export type CreateGatewayOrderInput = z.infer<typeof createGatewayOrderSchema>;
export type VerifyGatewayPaymentInput = z.infer<typeof verifyGatewayPaymentSchema>;
export type SettleOfflinePaymentInput = z.infer<typeof settleOfflinePaymentSchema>;
