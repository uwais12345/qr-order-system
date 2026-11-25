import { Router } from 'express';
import { RestaurantRole } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.js';
import { requireTenant } from '../../middlewares/tenantGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  createCategorySchema,
  createMenuItemSchema,
  createModifierGroupSchema,
  createTaxRuleSchema,
  deleteCategoryQuerySchema,
  reorderCategoriesSchema,
  updateCategorySchema,
  updateItemAvailabilitySchema,
  updateMenuItemSchema,
  updateModifierGroupSchema,
  updateTaxRuleSchema,
} from './menu.schema.js';
import {
  createCategoryHandler,
  createMenuItemHandler,
  createModifierGroupHandler,
  createTaxRuleHandler,
  deleteCategoryHandler,
  deleteMenuItemHandler,
  getCatalogHandler,
  reorderCategoriesHandler,
  updateCategoryHandler,
  updateItemAvailabilityHandler,
  updateMenuItemHandler,
  updateModifierGroupHandler,
  updateTaxRuleHandler,
} from './menu.controller.js';

const router = Router({ mergeParams: true });
const categoryParams = z.object({ restaurantId: z.string().min(1), categoryId: z.string().uuid() });
const itemParams = z.object({ restaurantId: z.string().min(1), itemId: z.string().uuid() });
const groupParams = z.object({ restaurantId: z.string().min(1), groupId: z.string().uuid() });
const taxParams = z.object({ restaurantId: z.string().min(1), taxRuleId: z.string().uuid() });

router.use(requireAuth);

router.get(
  '/',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER, RestaurantRole.KITCHEN] }),
  getCatalogHandler
);

// Categories
router.post(
  '/categories',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ body: createCategorySchema }),
  createCategoryHandler
);
router.post(
  '/categories/reorder',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ body: reorderCategoriesSchema }),
  reorderCategoriesHandler
);
router.patch(
  '/categories/:categoryId',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ params: categoryParams, body: updateCategorySchema }),
  updateCategoryHandler
);
router.delete(
  '/categories/:categoryId',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ params: categoryParams, query: deleteCategoryQuerySchema }),
  deleteCategoryHandler
);

// Menu Items
router.post(
  '/items',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ body: createMenuItemSchema }),
  createMenuItemHandler
);
router.patch(
  '/items/:itemId',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ params: itemParams, body: updateMenuItemSchema }),
  updateMenuItemHandler
);
router.patch(
  '/items/:itemId/availability',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER, RestaurantRole.KITCHEN] }),
  validateRequest({ params: itemParams, body: updateItemAvailabilitySchema }),
  updateItemAvailabilityHandler
);
router.delete(
  '/items/:itemId',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ params: itemParams }),
  deleteMenuItemHandler
);

// Modifier Groups
router.post(
  '/modifier-groups',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ body: createModifierGroupSchema }),
  createModifierGroupHandler
);
router.patch(
  '/modifier-groups/:groupId',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ params: groupParams, body: updateModifierGroupSchema }),
  updateModifierGroupHandler
);

// Tax Rules
router.post(
  '/tax-rules',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ body: createTaxRuleSchema }),
  createTaxRuleHandler
);
router.patch(
  '/tax-rules/:taxRuleId',
  requireTenant({ allowedRoles: [RestaurantRole.OWNER] }),
  validateRequest({ params: taxParams, body: updateTaxRuleSchema }),
  updateTaxRuleHandler
);

export default router;
