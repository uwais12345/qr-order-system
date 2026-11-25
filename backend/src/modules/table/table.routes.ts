import { Router } from 'express';
import { RestaurantRole } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.js';
import { requireTenant } from '../../middlewares/tenantGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  createTableSchema,
  listTablesQuerySchema,
  rotateQrSchema,
  updateTableSchema,
} from './table.schema.js';
import {
  createTableHandler,
  listTablesHandler,
  revokeQrHandler,
  rotateQrHandler,
  updateTableHandler,
} from './table.controller.js';

const router = Router({ mergeParams: true });
const tableParams = z.object({ restaurantId: z.string().min(1), tableId: z.string().uuid() });

router.use(requireAuth);

router.get(
  '/',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER, RestaurantRole.KITCHEN] }),
  validateRequest({ query: listTablesQuerySchema }),
  listTablesHandler
);

router.post(
  '/',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ body: createTableSchema }),
  createTableHandler
);

router.patch(
  '/:tableId',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ params: tableParams, body: updateTableSchema }),
  updateTableHandler
);

router.post(
  '/:tableId/qr-rotate',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ params: tableParams, body: rotateQrSchema }),
  rotateQrHandler
);

router.post(
  '/:tableId/qr-revoke',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ params: tableParams }),
  revokeQrHandler
);

export default router;
