import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireGuestSession } from '../../middlewares/guestAuth.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  addCartItemSchema,
  createGuestSessionSchema,
  placeOrderSchema,
  updateCartItemSchema,
} from './guest.schema.js';
import {
  addCartItemHandler,
  clearCartHandler,
  createGuestSessionHandler,
  getCartHandler,
  getGuestMenuHandler,
  getGuestOrderHandler,
  listGuestOrdersHandler,
  placeOrderHandler,
  removeCartItemHandler,
  updateCartItemHandler,
} from './guest.controller.js';

const router = Router();
const cartItemParams = z.object({ cartItemId: z.string().uuid() });
const orderParams = z.object({ orderId: z.string().uuid() });

const guestActionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many requests from this device, please wait a moment.',
      statusCode: 429,
    },
  },
});

// QR validation & guest session creation (public, rate-limited)
router.post(
  '/sessions',
  guestActionLimiter,
  validateRequest({ body: createGuestSessionSchema }),
  createGuestSessionHandler
);

// Menu browsing (requires active guest session + operational restaurant/subscription)
router.get('/menu', requireGuestSession({ enforceOperational: true }), getGuestMenuHandler);

// Server-side cart management
router.get('/cart', requireGuestSession({ enforceOperational: true }), getCartHandler);
router.post(
  '/cart/items',
  requireGuestSession({ enforceOperational: true }),
  validateRequest({ body: addCartItemSchema }),
  addCartItemHandler
);
router.patch(
  '/cart/items/:cartItemId',
  requireGuestSession({ enforceOperational: true }),
  validateRequest({ params: cartItemParams, body: updateCartItemSchema }),
  updateCartItemHandler
);
router.delete(
  '/cart/items/:cartItemId',
  requireGuestSession({ enforceOperational: true }),
  validateRequest({ params: cartItemParams }),
  removeCartItemHandler
);
router.delete('/cart', requireGuestSession({ enforceOperational: true }), clearCartHandler);

// Checkout & Order tracking
router.post(
  '/orders',
  guestActionLimiter,
  requireGuestSession({ enforceOperational: true }),
  validateRequest({ body: placeOrderSchema }),
  placeOrderHandler
);
router.get(
  '/orders',
  requireGuestSession({ enforceOperational: false }),
  listGuestOrdersHandler
);
router.get(
  '/orders/:orderId',
  requireGuestSession({ enforceOperational: false }),
  validateRequest({ params: orderParams }),
  getGuestOrderHandler
);

export default router;
