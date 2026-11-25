import { Request, Response, NextFunction } from 'express';
import { guestSessionService } from './guestSession.service.js';
import { cartService } from './cart.service.js';
import { checkoutService } from './checkout.service.js';

export async function createGuestSessionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await guestSessionService.createSessionFromQr(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getGuestMenuHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const menu = await guestSessionService.getGuestMenu(req.guestSession!);
    res.json({ success: true, data: menu });
  } catch (error) {
    next(error);
  }
}

export async function getCartHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const cart = await cartService.getCartSummary(req.guestSession!);
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
}

export async function addCartItemHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const cart = await cartService.addItem(req.guestSession!, req.body);
    res.status(201).json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
}

export async function updateCartItemHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const cart = await cartService.updateItem(
      req.guestSession!,
      req.params.cartItemId,
      req.body
    );
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
}

export async function removeCartItemHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const cart = await cartService.removeItem(req.guestSession!, req.params.cartItemId);
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
}

export async function clearCartHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const cart = await cartService.clearCart(req.guestSession!);
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
}

export async function placeOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await checkoutService.placeOrder(req.guestSession!, req.body);
    res.status(result.idempotentReplay ? 200 : 201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function listGuestOrdersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const orders = await checkoutService.listGuestOrders(req.guestSession!.id);
    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
}

export async function getGuestOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await checkoutService.getGuestOrderById(
      req.guestSession!.id,
      req.params.orderId
    );
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
}
