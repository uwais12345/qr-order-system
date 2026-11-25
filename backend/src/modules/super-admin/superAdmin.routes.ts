import { Router } from 'express';
import { PlatformRole } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.js';
import { requirePlatformRole } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  assignSubscriptionSchema,
  auditLogsQuerySchema,
  createPlanSchema,
  createRestaurantSchema,
  listRestaurantsQuerySchema,
  updatePlanSchema,
  updateRestaurantSchema,
} from './superAdmin.schema.js';
import {
  assignSubscriptionHandler,
  createPlanHandler,
  createRestaurantHandler,
  getDashboardHandler,
  getRestaurantHandler,
  listAuditLogsHandler,
  listPlansHandler,
  listRestaurantsHandler,
  updatePlanHandler,
  updateRestaurantHandler,
} from './superAdmin.controller.js';

const router = Router();
const restaurantParams = z.object({ restaurantId: z.string().uuid() });
const planParams = z.object({ planId: z.string().uuid() });

router.use(requireAuth, requirePlatformRole(PlatformRole.SUPER_ADMIN));

router.get('/dashboard', getDashboardHandler);

router.get(
  '/restaurants',
  validateRequest({ query: listRestaurantsQuerySchema }),
  listRestaurantsHandler
);
router.post(
  '/restaurants',
  validateRequest({ body: createRestaurantSchema }),
  createRestaurantHandler
);
router.get(
  '/restaurants/:restaurantId',
  validateRequest({ params: restaurantParams }),
  getRestaurantHandler
);
router.patch(
  '/restaurants/:restaurantId',
  validateRequest({ params: restaurantParams, body: updateRestaurantSchema }),
  updateRestaurantHandler
);
router.post(
  '/restaurants/:restaurantId/subscriptions',
  validateRequest({ params: restaurantParams, body: assignSubscriptionSchema }),
  assignSubscriptionHandler
);

router.get('/plans', listPlansHandler);
router.post('/plans', validateRequest({ body: createPlanSchema }), createPlanHandler);
router.patch(
  '/plans/:planId',
  validateRequest({ params: planParams, body: updatePlanSchema }),
  updatePlanHandler
);

router.get(
  '/audit-logs',
  validateRequest({ query: auditLogsQuerySchema }),
  listAuditLogsHandler
);

export default router;
