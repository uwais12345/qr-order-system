import { Request, Response, NextFunction } from 'express';
import { menuService } from './menu.service.js';

export async function getCatalogHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    const catalog = await menuService.getCatalog(req.tenantContext!.restaurantId, branchId);
    res.json({ success: true, data: catalog });
  } catch (error) {
    next(error);
  }
}

export async function createCategoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await menuService.createCategory(
      req.tenantContext!.restaurantId,
      req.body,
      req.user!.id
    );
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
}

export async function updateCategoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await menuService.updateCategory(
      req.tenantContext!.restaurantId,
      req.params.categoryId,
      req.body,
      req.user!.id
    );
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
}

export async function reorderCategoriesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await menuService.reorderCategories(
      req.tenantContext!.restaurantId,
      req.body.items,
      req.user!.id
    );
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
}

export async function deleteCategoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const reassignToCategoryId =
      typeof req.query.reassignToCategoryId === 'string'
        ? req.query.reassignToCategoryId
        : undefined;
    const result = await menuService.deleteCategory(
      req.tenantContext!.restaurantId,
      req.params.categoryId,
      req.user!.id,
      reassignToCategoryId
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function createMenuItemHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await menuService.createMenuItem(
      req.tenantContext!.restaurantId,
      req.body,
      req.user!.id
    );
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
}

export async function updateMenuItemHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await menuService.updateMenuItem(
      req.tenantContext!.restaurantId,
      req.params.itemId,
      req.body,
      req.user!.id
    );
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
}

export async function updateItemAvailabilityHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const item = await menuService.updateItemAvailability(
      req.tenantContext!.restaurantId,
      req.params.itemId,
      req.body.availabilityStatus,
      req.user!.id
    );
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
}

export async function deleteMenuItemHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await menuService.deleteMenuItem(
      req.tenantContext!.restaurantId,
      req.params.itemId,
      req.user!.id
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function createModifierGroupHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const group = await menuService.createModifierGroup(
      req.tenantContext!.restaurantId,
      req.body,
      req.user!.id
    );
    res.status(201).json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
}

export async function updateModifierGroupHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const group = await menuService.updateModifierGroup(
      req.tenantContext!.restaurantId,
      req.params.groupId,
      req.body,
      req.user!.id
    );
    res.json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
}

export async function createTaxRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const rule = await menuService.createTaxRule(
      req.tenantContext!.restaurantId,
      req.body,
      req.user!.id
    );
    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
}

export async function updateTaxRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const rule = await menuService.updateTaxRule(
      req.tenantContext!.restaurantId,
      req.params.taxRuleId,
      req.body,
      req.user!.id
    );
    res.json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
}
