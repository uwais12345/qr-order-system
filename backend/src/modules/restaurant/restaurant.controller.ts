import { Request, Response, NextFunction } from 'express';
import { restaurantService } from './restaurant.service.js';

export async function getProfileHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await restaurantService.getProfile(req.tenantContext!.restaurantId);
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
}

export async function updateProfileHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const updated = await restaurantService.updateProfile(
      req.tenantContext!.restaurantId,
      req.body,
      req.user!.id
    );
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

export async function listBranchesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const branches = await restaurantService.listBranches(req.tenantContext!.restaurantId);
    res.json({ success: true, data: branches });
  } catch (error) {
    next(error);
  }
}

export async function createBranchHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const branch = await restaurantService.createBranch(
      req.tenantContext!.restaurantId,
      req.body,
      req.user!.id
    );
    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    next(error);
  }
}

export async function updateBranchHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const branch = await restaurantService.updateBranch(
      req.tenantContext!.restaurantId,
      req.params.branchId,
      req.body,
      req.user!.id
    );
    res.json({ success: true, data: branch });
  } catch (error) {
    next(error);
  }
}

export async function listStaffHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const staff = await restaurantService.listStaff(req.tenantContext!.restaurantId);
    res.json({ success: true, data: staff });
  } catch (error) {
    next(error);
  }
}

export async function createStaffHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const member = await restaurantService.createStaffMember(
      req.tenantContext!.restaurantId,
      req.body,
      req.user!.id
    );
    res.status(201).json({ success: true, data: member });
  } catch (error) {
    next(error);
  }
}

export async function updateStaffHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const member = await restaurantService.updateStaffMember(
      req.tenantContext!.restaurantId,
      req.params.membershipId,
      req.body,
      req.user!.id
    );
    res.json({ success: true, data: member });
  } catch (error) {
    next(error);
  }
}
