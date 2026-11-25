import { Request, Response, NextFunction } from 'express';
import { tableService } from './table.service.js';

export async function listTablesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    const tables = await tableService.listTables(req.tenantContext!.restaurantId, branchId);
    res.json({ success: true, data: tables });
  } catch (error) {
    next(error);
  }
}

export async function createTableHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await tableService.createTable(
      req.tenantContext!.restaurantId,
      req.body,
      req.user!.id
    );
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateTableHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const updated = await tableService.updateTable(
      req.tenantContext!.restaurantId,
      req.params.tableId,
      req.body,
      req.user!.id
    );
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

export async function rotateQrHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await tableService.rotateQrToken(
      req.tenantContext!.restaurantId,
      req.params.tableId,
      req.body,
      req.user!.id
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function revokeQrHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await tableService.revokeQrTokens(
      req.tenantContext!.restaurantId,
      req.params.tableId,
      req.user!.id
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
