import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { NotFoundError } from './utils/errors.js';
import authRoutes from './modules/auth/auth.routes.js';
import superAdminRoutes from './modules/super-admin/superAdmin.routes.js';
import restaurantRoutes from './modules/restaurant/restaurant.routes.js';
import tableRoutes from './modules/table/table.routes.js';
import menuRoutes from './modules/menu/menu.routes.js';
import orderRoutes from './modules/order/order.routes.js';
import guestRoutes from './modules/guest/guest.routes.js';
import {
  guestPaymentRouter,
  restaurantPaymentRouter,
  webhookPaymentRouter,
} from './modules/payment/payment.routes.js';

export function createApp() {
  const app = express();

  // 1. Security & CORS
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-guest-token'],
    })
  );

  // 2. Payment Webhooks (must receive exact raw Buffer body BEFORE express.json)
  app.use(`${env.API_PREFIX}/webhooks`, webhookPaymentRouter);

  // 3. Body Parser
  app.use(express.json());

  // 3. Rate limiting for sensitive authentication endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 login requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        message: 'Too many login attempts from this IP, please try again after 15 minutes',
        statusCode: 429,
      },
    },
  });

  // 4. Base Probes & Health Check
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        status: 'UP',
        database: 'CONNECTED',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'DOWN',
        database: 'DISCONNECTED',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // 5. Mount API Routes
  app.use(`${env.API_PREFIX}/auth`, authLimiter, authRoutes);
  app.use(`${env.API_PREFIX}/super-admin`, superAdminRoutes);
  app.use(`${env.API_PREFIX}/restaurants/:restaurantId/tables`, tableRoutes);
  app.use(`${env.API_PREFIX}/restaurants/:restaurantId/menu`, menuRoutes);
  app.use(`${env.API_PREFIX}/restaurants/:restaurantId/orders`, orderRoutes);
  app.use(`${env.API_PREFIX}/restaurants/:restaurantId/payments`, restaurantPaymentRouter);
  app.use(`${env.API_PREFIX}/restaurants/:restaurantId`, restaurantRoutes);
  app.use(`${env.API_PREFIX}/guest/payments`, guestPaymentRouter);
  app.use(`${env.API_PREFIX}/guest`, guestRoutes);

  // 6. Catch-all for unmatched routes
  app.use((req, _res, next) => {
    next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
  });

  // 7. Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export default createApp;
