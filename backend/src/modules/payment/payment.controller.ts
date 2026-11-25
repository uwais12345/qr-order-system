import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../../utils/errors.js';
import { paymentService } from './payment.service.js';

export async function createGatewayOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentService.createGatewayOrder(req.guestSession!, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function verifyGatewayPaymentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentService.verifyGatewayPayment(req.guestSession!, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function razorpayWebhookHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!Buffer.isBuffer(req.body)) {
      throw new BadRequestError('Webhook requires raw application/json payload');
    }

    const signatureHeader = req.headers['x-razorpay-signature'];
    const eventIdHeader = req.headers['x-razorpay-event-id'];

    if (typeof signatureHeader !== 'string' || !signatureHeader.trim()) {
      throw new BadRequestError('Missing x-razorpay-signature header');
    }

    const result = await paymentService.processWebhook(
      req.body,
      signatureHeader,
      typeof eventIdHeader === 'string' ? eventIdHeader : undefined
    );

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function settleOfflinePaymentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentService.settleOfflinePayment(
      req.tenantContext!.restaurantId,
      req.params.orderId,
      req.body,
      req.user!.id
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getPaymentSummaryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    const summary = await paymentService.getVerifiedRevenueSummary(
      req.tenantContext!.restaurantId,
      branchId
    );
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
}
