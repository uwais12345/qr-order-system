import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { RestaurantRole } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.js';
import { requireGuestSession } from '../../middlewares/guestAuth.js';
import { requireTenant } from '../../middlewares/tenantGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  createGatewayOrderSchema,
  paymentSummaryQuerySchema,
  settleOfflinePaymentSchema,
  verifyGatewayPaymentSchema,
} from './payment.schema.js';
import {
  createGatewayOrderHandler,
  getPaymentSummaryHandler,
  razorpayWebhookHandler,
  settleOfflinePaymentHandler,
  verifyGatewayPaymentHandler,
} from './payment.controller.js';

const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many payment attempts, please try again shortly.',
      statusCode: 429,
    },
  },
});

export const guestPaymentRouter = Router();
guestPaymentRouter.post(
  '/create-order',
  paymentLimiter,
  requireGuestSession({ enforceOperational: true }),
  validateRequest({ body: createGatewayOrderSchema }),
  createGatewayOrderHandler
);
guestPaymentRouter.post(
  '/verify',
  paymentLimiter,
  requireGuestSession({ enforceOperational: false }),
  validateRequest({ body: verifyGatewayPaymentSchema }),
  verifyGatewayPaymentHandler
);

export const webhookPaymentRouter = Router();
webhookPaymentRouter.post(
  '/razorpay',
  express.raw({ type: 'application/json' }),
  razorpayWebhookHandler
);

const orderPaymentParams = z.object({
  restaurantId: z.string().min(1),
  orderId: z.string().uuid(),
});

export const restaurantPaymentRouter = Router({ mergeParams: true });
restaurantPaymentRouter.use(requireAuth);
restaurantPaymentRouter.get(
  '/summary',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ query: paymentSummaryQuerySchema }),
  getPaymentSummaryHandler
);
restaurantPaymentRouter.post(
  '/orders/:orderId/settle-offline',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ params: orderPaymentParams, body: settleOfflinePaymentSchema }),
  settleOfflinePaymentHandler
);
