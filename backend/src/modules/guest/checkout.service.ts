import crypto from 'crypto';
import {
  CartStatus,
  ItemAvailability,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RestaurantStatus,
} from '@prisma/client';
import { Decimal } from 'decimal.js';
import { prisma } from '../../config/prisma.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  SubscriptionInactiveError,
} from '../../utils/errors.js';
import { normalizeIndianMobile } from '../../utils/phone.js';
import { canRestaurantReceiveOrders } from '../../utils/subscription.js';
import {
  calculateLineItemPricing,
  calculateOrderFinancials,
  ModifierGroupSpec,
  roundMoney,
  validateModifierSelections,
} from '../../utils/pricing.js';
import {
  generateNextOrderNumber,
  serializeOrder,
} from '../../utils/orderHelpers.js';
import { realtimeEmitter } from '../../realtime/realtimeEmitter.js';
import { GuestSessionContext } from '../../types/express.js';
import { PlaceOrderInput } from './guest.schema.js';

const MAX_CHECKOUT_RETRIES = 3;

async function withCheckoutRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_CHECKOUT_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2002');
      if (!isRetryable || attempt === MAX_CHECKOUT_RETRIES) {
        throw error;
      }
    }
  }
  throw lastError;
}

export class CheckoutService {
  async placeOrder(guestSession: GuestSessionContext, input: PlaceOrderInput) {
    const normalizedPhone = normalizeIndianMobile(input.customerPhone);
    const idempotencyKey = input.idempotencyKey?.trim() || `chk_${crypto.randomUUID()}`;

    // 1. Validate payment method against restaurant setting (FR-PAY-03, BR-03)
    if (
      input.paymentMethod === PaymentMethod.PAY_AT_RESTAURANT &&
      !guestSession.payAtRestaurantEnabled
    ) {
      throw new BadRequestError('Pay at Restaurant is not enabled for this restaurant');
    }

    // 2. Idempotency replay check for browser retries
    if (input.idempotencyKey) {
      const existingPayment = await prisma.payment.findUnique({
        where: { idempotencyKey },
        include: {
          order: {
            include: {
              restaurant: true,
              branch: true,
              diningTable: true,
              items: { include: { modifiers: true } },
              taxLines: true,
              payments: true,
              statusHistory: { orderBy: { createdAt: 'asc' } },
            },
          },
        },
      });

      if (existingPayment) {
        if (existingPayment.order.guestSessionId !== guestSession.id) {
          throw new ConflictError('Idempotency key has already been used by another session');
        }
        return {
          idempotentReplay: true,
          order: serializeOrder(existingPayment.order),
        };
      }
    }

    // 3. Atomic transaction for checkout, snapshots, payment initiation, and new cart creation
    const createdOrder = await withCheckoutRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const now = new Date();

          // Re-verify restaurant & subscription status inside transaction (BR-04)
          const restaurant = await tx.restaurant.findUnique({
            where: { id: guestSession.restaurantId },
            include: {
              subscriptions: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: { status: true, endsAt: true },
              },
            },
          });

          if (
            !restaurant ||
            !canRestaurantReceiveOrders(
              restaurant.status as RestaurantStatus,
              restaurant.subscriptions[0] ?? null,
              now
            )
          ) {
            throw new SubscriptionInactiveError(
              'This restaurant is currently not accepting new orders.'
            );
          }

          if (
            input.paymentMethod === PaymentMethod.PAY_AT_RESTAURANT &&
            !restaurant.payAtRestaurantEnabled
          ) {
            throw new BadRequestError('Pay at Restaurant is not enabled for this restaurant');
          }

          const activeCart = await tx.cart.findFirst({
            where: { guestSessionId: guestSession.id, status: CartStatus.ACTIVE },
            orderBy: { createdAt: 'desc' },
            include: {
              items: {
                include: {
                  menuItem: {
                    include: {
                      category: true,
                      modifierGroups: {
                        include: {
                          modifierGroup: { include: { options: true } },
                        },
                      },
                    },
                  },
                  selectedModifiers: {
                    include: {
                      modifierOption: {
                        include: { modifierGroup: true },
                      },
                    },
                  },
                },
              },
            },
          });

          if (!activeCart || activeCart.items.length === 0) {
            throw new BadRequestError('Cannot place order with an empty cart');
          }

          const taxRules = await tx.taxRule.findMany({
            where: {
              restaurantId: guestSession.restaurantId,
              isActive: true,
              effectiveFrom: { lte: now },
              AND: [
                { OR: [{ branchId: null }, { branchId: guestSession.branchId }] },
                { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
              ],
            },
            orderBy: { name: 'asc' },
          });

          const unavailableItems: { cartItemId: string; name: string }[] = [];
          const priceChanges: {
            cartItemId: string;
            name: string;
            previousUnitPrice: string;
            currentUnitPrice: string;
          }[] = [];

          const preparedItems: {
            menuItemId: string;
            itemNameSnapshot: string;
            quantity: number;
            unitPrice: Decimal;
            lineTotal: Decimal;
            modifiers: {
              modifierNameSnapshot: string;
              optionNameSnapshot: string;
              priceDelta: Decimal;
            }[];
          }[] = [];

          for (const ci of activeCart.items) {
            const isItemValid =
              ci.menuItem.availabilityStatus === ItemAvailability.AVAILABLE &&
              ci.menuItem.category.isActive &&
              ci.menuItem.category.restaurantId === guestSession.restaurantId;

            if (!isItemValid) {
              unavailableItems.push({ cartItemId: ci.id, name: ci.menuItem.name });
              continue;
            }

            const groupSpecs: ModifierGroupSpec[] = ci.menuItem.modifierGroups.map((mg) => ({
              id: mg.modifierGroup.id,
              name: mg.modifierGroup.name,
              minSelect: mg.modifierGroup.minSelect,
              maxSelect: mg.modifierGroup.maxSelect,
              isRequired: mg.modifierGroup.isRequired,
              options: mg.modifierGroup.options.map((opt) => ({
                id: opt.id,
                name: opt.name,
                priceDelta: opt.priceDelta,
                isAvailable: opt.isAvailable,
              })),
            }));

            const validatedMods = validateModifierSelections(
              groupSpecs,
              ci.selectedModifiers.map((m) => m.modifierOptionId)
            );

            const previousCalc = calculateLineItemPricing(
              ci.unitPriceAtAdd,
              ci.quantity,
              ci.selectedModifiers.map((m) => ({ priceDelta: m.priceDeltaAtAdd }))
            );
            const currentCalc = calculateLineItemPricing(
              ci.menuItem.price,
              ci.quantity,
              validatedMods.map((m) => ({ priceDelta: m.priceDelta }))
            );

            if (!previousCalc.unitPrice.equals(currentCalc.unitPrice)) {
              priceChanges.push({
                cartItemId: ci.id,
                name: ci.menuItem.name,
                previousUnitPrice: previousCalc.unitPrice.toFixed(2),
                currentUnitPrice: currentCalc.unitPrice.toFixed(2),
              });
            }

            preparedItems.push({
              menuItemId: ci.menuItem.id,
              itemNameSnapshot: ci.menuItem.name,
              quantity: ci.quantity,
              unitPrice: currentCalc.unitPrice,
              lineTotal: currentCalc.lineTotal,
              modifiers: validatedMods.map((m) => ({
                modifierNameSnapshot: m.modifierGroupName,
                optionNameSnapshot: m.optionName,
                priceDelta: roundMoney(m.priceDelta),
              })),
            });
          }

          if (unavailableItems.length > 0) {
            throw new ConflictError(
              'Some items in your cart are no longer available. Please review your cart.',
              { code: 'ITEMS_UNAVAILABLE', unavailableItems }
            );
          }

          if (priceChanges.length > 0 && !input.acceptPriceChanges) {
            throw new ConflictError(
              'Menu prices changed since you added items to your cart. Please confirm updated totals.',
              { code: 'PRICE_CHANGED', priceChanges }
            );
          }

          const financials = calculateOrderFinancials(
            preparedItems.map((p) => p.lineTotal),
            taxRules,
            now
          );

          const orderNumber = await generateNextOrderNumber(tx);

          await tx.guestSession.update({
            where: { id: guestSession.id },
            data: {
              customerName: input.customerName.trim(),
              customerPhone: normalizedPhone,
            },
          });

          const order = await tx.customerOrder.create({
            data: {
              restaurantId: guestSession.restaurantId,
              branchId: guestSession.branchId,
              diningTableId: guestSession.diningTableId,
              guestSessionId: guestSession.id,
              cartId: activeCart.id,
              orderNumber,
              customerName: input.customerName.trim(),
              customerPhone: normalizedPhone,
              status: OrderStatus.PENDING,
              subtotal: financials.subtotal,
              taxTotal: financials.taxTotal,
              discountTotal: new Decimal(0),
              grandTotal: financials.grandTotal,
              estimatedPrepMinutes: 15,
              notes: input.notes?.trim() || null,
              items: {
                create: preparedItems.map((item) => ({
                  menuItemId: item.menuItemId,
                  itemNameSnapshot: item.itemNameSnapshot,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  lineTotal: item.lineTotal,
                  modifiers:
                    item.modifiers.length > 0
                      ? { create: item.modifiers }
                      : undefined,
                })),
              },
              taxLines:
                financials.taxLines.length > 0
                  ? { create: financials.taxLines }
                  : undefined,
              statusHistory: {
                create: {
                  fromStatus: null,
                  toStatus: OrderStatus.PENDING,
                  reason: 'Order placed by guest via QR menu',
                },
              },
              payments: {
                create: {
                  provider:
                    input.paymentMethod === PaymentMethod.PAY_AT_RESTAURANT
                      ? 'OFFLINE_CASHIER'
                      : 'RAZORPAY',
                  method: input.paymentMethod,
                  status:
                    input.paymentMethod === PaymentMethod.PAY_AT_RESTAURANT
                      ? PaymentStatus.PENDING
                      : PaymentStatus.INITIATED,
                  amount: financials.grandTotal,
                  currency: 'INR',
                  idempotencyKey,
                },
              },
            },
            include: {
              restaurant: true,
              branch: true,
              diningTable: true,
              items: { include: { modifiers: true } },
              taxLines: true,
              payments: true,
              statusHistory: { orderBy: { createdAt: 'asc' } },
            },
          });

          // Mark current cart checked out and open a fresh cart for "Order more food" (FR-ORD-08)
          await tx.cart.update({
            where: { id: activeCart.id },
            data: { status: CartStatus.CHECKED_OUT },
          });

          await tx.cart.create({
            data: {
              guestSessionId: guestSession.id,
              status: CartStatus.ACTIVE,
            },
          });

          return order;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    );

    // Emit real-time order:created notification after transaction commits (FR-RT-01)
    realtimeEmitter.emitOrderCreated({
      id: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      restaurantId: createdOrder.restaurantId ?? guestSession.restaurantId,
      branchId: createdOrder.branchId ?? guestSession.branchId,
      diningTableId: createdOrder.diningTableId ?? guestSession.diningTableId,
      guestSessionId: createdOrder.guestSessionId ?? guestSession.id,
      status: createdOrder.status,
      estimatedPrepMinutes: createdOrder.estimatedPrepMinutes,
      grandTotal: new Decimal(createdOrder.grandTotal).toFixed(2),
    });

    return {
      idempotentReplay: false,
      order: serializeOrder(createdOrder),
    };
  }

  async listGuestOrders(guestSessionId: string) {
    const orders = await prisma.customerOrder.findMany({
      where: { guestSessionId },
      orderBy: { createdAt: 'desc' },
      include: {
        restaurant: true,
        branch: true,
        diningTable: true,
        items: { include: { modifiers: true } },
        taxLines: true,
        payments: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });

    return orders.map(serializeOrder);
  }

  async getGuestOrderById(guestSessionId: string, orderId: string) {
    const order = await prisma.customerOrder.findFirst({
      where: { id: orderId, guestSessionId },
      include: {
        restaurant: true,
        branch: true,
        diningTable: true,
        items: { include: { modifiers: true } },
        taxLines: true,
        payments: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found for your guest session');
    }

    return serializeOrder(order);
  }
}

export const checkoutService = new CheckoutService();
