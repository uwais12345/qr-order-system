import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';

export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.login(req.body);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.refreshToken(req.body.refreshToken);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function meHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await authService.getCurrentUser(req.user!.id);
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

export async function logoutHandler(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
}
