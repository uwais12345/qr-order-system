import { Router } from 'express';
import { RestaurantRole } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.js';
import { requireTenant } from '../../middlewares/tenantGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  createBranchSchema,
  createStaffMemberSchema,
  updateBranchSchema,
  updateRestaurantProfileSchema,
  updateStaffMemberSchema,
} from './restaurant.schema.js';
import {
  createBranchHandler,
  createStaffHandler,
  getProfileHandler,
  listBranchesHandler,
  listStaffHandler,
  updateBranchHandler,
  updateProfileHandler,
  updateStaffHandler,
} from './restaurant.controller.js';

const router = Router({ mergeParams: true });
const branchParams = z.object({ restaurantId: z.string().min(1), branchId: z.string().uuid() });
const staffParams = z.object({ restaurantId: z.string().min(1), membershipId: z.string().uuid() });

router.use(requireAuth);

router.get('/', requireTenant({ allowedRoles: [RestaurantRole.OWNER, RestaurantRole.KITCHEN] }), getProfileHandler);
router.patch(
  '/',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ body: updateRestaurantProfileSchema }),
  updateProfileHandler
);

router.get(
  '/branches',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER, RestaurantRole.KITCHEN] }),
  listBranchesHandler
);
router.post(
  '/branches',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ body: createBranchSchema }),
  createBranchHandler
);
router.patch(
  '/branches/:branchId',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ params: branchParams, body: updateBranchSchema }),
  updateBranchHandler
);

router.get(
  '/staff',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  listStaffHandler
);
router.post(
  '/staff',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ body: createStaffMemberSchema }),
  createStaffHandler
);
router.patch(
  '/staff/:membershipId',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ params: staffParams, body: updateStaffMemberSchema }),
  updateStaffHandler
);

export default router;
