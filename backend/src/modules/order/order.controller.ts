import { Request, Response, NextFunction } from 'express';
import { orderService } from './order.service.js';
import { ListOrdersQuery } from './order.schema.js';

export async function listOrdersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as unknown as ListOrdersQuery;
    const result = await orderService.listOrders(req.tenantContext!.restaurantId, query);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await orderService.getOrderById(
      req.tenantContext!.restaurantId,
      req.params.orderId
    );
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
}

export async function updateOrderStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await orderService.transitionOrderStatus(
      req.tenantContext!.restaurantId,
      req.params.orderId,
      req.body,
      req.user!.id,
      req.tenantContext!.userRole
    );
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
}

export async function updateOrderEstimateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await orderService.updatePrepEstimate(
      req.tenantContext!.restaurantId,
      req.params.orderId,
      req.body.estimatedPrepMinutes,
      req.user!.id
    );
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
}
