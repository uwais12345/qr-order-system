import { Router } from 'express';
import { RestaurantRole } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.js';
import { requireTenant } from '../../middlewares/tenantGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  listOrdersQuerySchema,
  updateOrderEstimateSchema,
  updateOrderStatusSchema,
} from './order.schema.js';
import {
  getOrderHandler,
  listOrdersHandler,
  updateOrderEstimateHandler,
  updateOrderStatusHandler,
} from './order.controller.js';

const router = Router({ mergeParams: true });
const orderParams = z.object({ restaurantId: z.string().min(1), orderId: z.string().uuid() });

router.use(requireAuth);

router.get(
  '/',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER, RestaurantRole.KITCHEN] }),
  validateRequest({ query: listOrdersQuerySchema }),
  listOrdersHandler
);

router.get(
  '/:orderId',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER, RestaurantRole.KITCHEN] }),
  validateRequest({ params: orderParams }),
  getOrderHandler
);

router.patch(
  '/:orderId/status',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER, RestaurantRole.KITCHEN] }),
  validateRequest({ params: orderParams, body: updateOrderStatusSchema }),
  updateOrderStatusHandler
);

router.patch(
  '/:orderId/estimate',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER, RestaurantRole.KITCHEN] }),
  validateRequest({ params: orderParams, body: updateOrderEstimateSchema }),
  updateOrderEstimateHandler
);

export default router;
