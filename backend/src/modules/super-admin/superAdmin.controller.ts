import { Request, Response, NextFunction } from 'express';
import { RestaurantStatus } from '@prisma/client';
import { superAdminService } from './superAdmin.service.js';

export async function getDashboardHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const metrics = await superAdminService.getDashboardMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) {
    next(error);
  }
}

export async function listRestaurantsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, search } = req.query as { status?: RestaurantStatus; search?: string };
    const restaurants = await superAdminService.listRestaurants({ status, search });
    res.json({ success: true, data: restaurants });
  } catch (error) {
    next(error);
  }
}

export async function getRestaurantHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const restaurant = await superAdminService.getRestaurantById(req.params.restaurantId);
    res.json({ success: true, data: restaurant });
  } catch (error) {
    next(error);
  }
}

export async function createRestaurantHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await superAdminService.createRestaurant(req.body, req.user!.id);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateRestaurantHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const updated = await superAdminService.updateRestaurant(
      req.params.restaurantId,
      req.body,
      req.user!.id
    );
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

export async function listPlansHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const plans = await superAdminService.listPlans();
    res.json({ success: true, data: plans });
  } catch (error) {
    next(error);
  }
}

export async function createPlanHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await superAdminService.createPlan(req.body, req.user!.id);
    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
}

export async function updatePlanHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await superAdminService.updatePlan(req.params.planId, req.body, req.user!.id);
    res.json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
}

export async function assignSubscriptionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const sub = await superAdminService.assignSubscription(
      req.params.restaurantId,
      req.body,
      req.user!.id
    );
    res.status(201).json({ success: true, data: sub });
  } catch (error) {
    next(error);
  }
}

export async function listAuditLogsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as unknown as { restaurantId?: string; limit: number; offset: number };
    const logs = await superAdminService.listAuditLogs(query);
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
}
