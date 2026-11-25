import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../../config/env.js';

export interface CreateGatewayOrderInput {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface CreateGatewayOrderResult {
  providerOrderId: string;
  amountPaise: number;
  currency: string;
}

export interface VerifyCheckoutSignatureInput {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

export interface PaymentGatewayAdapter {
  readonly providerName: string;
  createOrder(input: CreateGatewayOrderInput): Promise<CreateGatewayOrderResult>;
  verifyCheckoutSignature(input: VerifyCheckoutSignatureInput): boolean;
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean;
}

function timingSafeHexCompare(expectedHex: string, actualHex: string): boolean {
  if (!expectedHex || !actualHex || expectedHex.length !== actualHex.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHex, 'hex'),
      Buffer.from(actualHex, 'hex')
    );
  } catch {
    return false;
  }
}

export class RazorpayGatewayAdapter implements PaymentGatewayAdapter {
  readonly providerName = 'RAZORPAY';
  private client: Razorpay | null = null;

  private getClient(): Razorpay {
    if (!this.client) {
      this.client = new Razorpay({
        key_id: env.RAZORPAY_KEY_ID,
        key_secret: env.RAZORPAY_KEY_SECRET,
      });
    }
    return this.client;
  }

  async createOrder(input: CreateGatewayOrderInput): Promise<CreateGatewayOrderResult> {
    const order = await this.getClient().orders.create({
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
    });

    return {
      providerOrderId: order.id,
      amountPaise: Number(order.amount),
      currency: order.currency,
    };
  }

  verifyCheckoutSignature(input: VerifyCheckoutSignatureInput): boolean {
    const payload = `${input.providerOrderId}|${input.providerPaymentId}`;
    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest('hex');

    return timingSafeHexCompare(expected, input.signature.trim().toLowerCase());
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean {
    if (!signatureHeader || rawBody.length === 0) {
      return false;
    }

    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    return timingSafeHexCompare(expected, signatureHeader.trim().toLowerCase());
  }
}

export const paymentGatewayAdapter: PaymentGatewayAdapter = new RazorpayGatewayAdapter();
