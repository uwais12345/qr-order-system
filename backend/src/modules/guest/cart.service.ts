import { CartStatus, ItemAvailability } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { prisma } from '../../config/prisma.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import {
  calculateLineItemPricing,
  calculateOrderFinancials,
  ModifierGroupSpec,
  roundMoney,
  validateModifierSelections,
} from '../../utils/pricing.js';
import { GuestSessionContext } from '../../types/express.js';
import { AddCartItemInput, UpdateCartItemInput } from './guest.schema.js';

function getVariantSignature(menuItemId: string, optionIds: string[], notes: string): string {
  const sortedIds = [...new Set(optionIds)].sort().join(',');
  return `${menuItemId}::${sortedIds}::${notes.trim().toLowerCase()}`;
}

async function fetchActiveTaxRules(restaurantId: string, branchId: string) {
  const now = new Date();
  return prisma.taxRule.findMany({
    where: {
      restaurantId,
      isActive: true,
      effectiveFrom: { lte: now },
      AND: [
        { OR: [{ branchId: null }, { branchId }] },
        { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      ],
    },
    orderBy: { name: 'asc' },
  });
}

export class CartService {
  async ensureActiveCart(guestSessionId: string) {
    const existing = await prisma.cart.findFirst({
      where: { guestSessionId, status: CartStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return existing;
    }

    return prisma.cart.create({
      data: {
        guestSessionId,
        status: CartStatus.ACTIVE,
      },
    });
  }

  async getCartSummary(guestSession: GuestSessionContext) {
    const cart = await this.ensureActiveCart(guestSession.id);

    const [fullCart, taxRules] = await Promise.all([
      prisma.cart.findUnique({
        where: { id: cart.id },
        include: {
          items: {
            include: {
              menuItem: {
                include: {
                  category: true,
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
      }),
      fetchActiveTaxRules(guestSession.restaurantId, guestSession.branchId),
    ]);

    const cartItems = fullCart?.items ?? [];
    const unavailableItems: { cartItemId: string; name: string; reason: string }[] = [];
    const priceChangedItems: {
      cartItemId: string;
      name: string;
      previousUnitPrice: string;
      currentUnitPrice: string;
    }[] = [];
    const validLineTotals: Decimal[] = [];
    let itemCount = 0;

    const formattedItems = cartItems.map((ci) => {
      const isMenuAvailable =
        ci.menuItem.availabilityStatus === ItemAvailability.AVAILABLE &&
        ci.menuItem.category.isActive;
      const unavailableOption = ci.selectedModifiers.find((m) => !m.modifierOption.isAvailable);
      const isAvailable = isMenuAvailable && !unavailableOption;

      if (!isAvailable) {
        unavailableItems.push({
          cartItemId: ci.id,
          name: ci.menuItem.name,
          reason: !isMenuAvailable
            ? 'Item is currently unavailable or sold out'
            : `Option "${unavailableOption?.modifierOption.name}" is unavailable`,
        });
      }

      const previousCalc = calculateLineItemPricing(
        ci.unitPriceAtAdd,
        ci.quantity,
        ci.selectedModifiers.map((m) => ({ priceDelta: m.priceDeltaAtAdd }))
      );
      const currentCalc = calculateLineItemPricing(
        ci.menuItem.price,
        ci.quantity,
        ci.selectedModifiers.map((m) => ({ priceDelta: m.modifierOption.priceDelta }))
      );

      if (!previousCalc.unitPrice.equals(currentCalc.unitPrice)) {
        priceChangedItems.push({
          cartItemId: ci.id,
          name: ci.menuItem.name,
          previousUnitPrice: previousCalc.unitPrice.toFixed(2),
          currentUnitPrice: currentCalc.unitPrice.toFixed(2),
        });
      }

      if (isAvailable) {
        validLineTotals.push(currentCalc.lineTotal);
        itemCount += ci.quantity;
      }

      return {
        cartItemId: ci.id,
        menuItemId: ci.menuItemId,
        name: ci.menuItem.name,
        imageUrl: ci.menuItem.imageUrl,
        isVeg: ci.menuItem.isVeg,
        quantity: ci.quantity,
        notes: ci.notes ?? '',
        isAvailable,
        basePrice: roundMoney(ci.menuItem.price).toFixed(2),
        unitPrice: currentCalc.unitPrice.toFixed(2),
        lineTotal: currentCalc.lineTotal.toFixed(2),
        selectedModifiers: ci.selectedModifiers.map((m) => ({
          optionId: m.modifierOptionId,
          groupName: m.modifierOption.modifierGroup.name,
          optionName: m.modifierOption.name,
          priceDelta: roundMoney(m.modifierOption.priceDelta).toFixed(2),
          isAvailable: m.modifierOption.isAvailable,
        })),
      };
    });

    const financials = calculateOrderFinancials(validLineTotals, taxRules);

    return {
      cartId: cart.id,
      status: cart.status,
      itemCount,
      items: formattedItems,
      warnings: {
        hasUnavailableItems: unavailableItems.length > 0,
        unavailableItems,
        hasPriceChanges: priceChangedItems.length > 0,
        priceChangedItems,
      },
      pricing: {
        subtotal: financials.subtotal.toFixed(2),
        taxTotal: financials.taxTotal.toFixed(2),
        grandTotal: financials.grandTotal.toFixed(2),
        taxLines: financials.taxLines.map((tl) => ({
          taxName: tl.taxNameSnapshot,
          rate: tl.rateSnapshot.toFixed(2),
          taxAmount: tl.taxAmount.toFixed(2),
        })),
      },
    };
  }

  async addItem(guestSession: GuestSessionContext, input: AddCartItemInput) {
    const menuItem = await prisma.menuItem.findFirst({
      where: {
        id: input.menuItemId,
        category: {
          restaurantId: guestSession.restaurantId,
          isActive: true,
          OR: [{ branchId: null }, { branchId: guestSession.branchId }],
        },
      },
      include: {
        modifierGroups: {
          include: {
            modifierGroup: {
              include: { options: true },
            },
          },
        },
      },
    });

    if (!menuItem) {
      throw new NotFoundError('Menu item not found for this restaurant branch');
    }

    if (menuItem.availabilityStatus !== ItemAvailability.AVAILABLE) {
      throw new BadRequestError(`"${menuItem.name}" is currently ${menuItem.availabilityStatus.toLowerCase()}`);
    }

    const groupSpecs: ModifierGroupSpec[] = menuItem.modifierGroups.map((mg) => ({
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

    const validatedModifiers = validateModifierSelections(groupSpecs, input.modifierOptionIds);
    const cleanNotes = input.notes.trim();
    const targetSig = getVariantSignature(
      menuItem.id,
      validatedModifiers.map((m) => m.optionId),
      cleanNotes
    );

    const activeCart = await this.ensureActiveCart(guestSession.id);
    const existingItems = await prisma.cartItem.findMany({
      where: { cartId: activeCart.id, menuItemId: menuItem.id },
      include: { selectedModifiers: true },
    });

    const matchingItem = existingItems.find((ci) => {
      const sig = getVariantSignature(
        ci.menuItemId,
        ci.selectedModifiers.map((m) => m.modifierOptionId),
        ci.notes ?? ''
      );
      return sig === targetSig;
    });

    if (matchingItem) {
      await prisma.cartItem.update({
        where: { id: matchingItem.id },
        data: {
          quantity: Math.min(50, matchingItem.quantity + input.quantity),
          unitPriceAtAdd: menuItem.price,
        },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: activeCart.id,
          menuItemId: menuItem.id,
          quantity: input.quantity,
          unitPriceAtAdd: menuItem.price,
          notes: cleanNotes || null,
          selectedModifiers:
            validatedModifiers.length > 0
              ? {
                  create: validatedModifiers.map((mod) => ({
                    modifierOptionId: mod.optionId,
                    priceDeltaAtAdd: mod.priceDelta,
                  })),
                }
              : undefined,
        },
      });
    }

    return this.getCartSummary(guestSession);
  }

  async updateItem(
    guestSession: GuestSessionContext,
    cartItemId: string,
    input: UpdateCartItemInput
  ) {
    const activeCart = await this.ensureActiveCart(guestSession.id);
    const existingItem = await prisma.cartItem.findFirst({
      where: { id: cartItemId, cartId: activeCart.id },
    });

    if (!existingItem) {
      throw new NotFoundError('Cart item not found in your active cart');
    }

    if (input.quantity === 0) {
      await prisma.cartItem.delete({ where: { id: cartItemId } });
    } else {
      await prisma.cartItem.update({
        where: { id: cartItemId },
        data: {
          quantity: input.quantity,
          notes: input.notes !== undefined ? input.notes.trim() || null : undefined,
        },
      });
    }

    return this.getCartSummary(guestSession);
  }

  async removeItem(guestSession: GuestSessionContext, cartItemId: string) {
    const activeCart = await this.ensureActiveCart(guestSession.id);
    const existingItem = await prisma.cartItem.findFirst({
      where: { id: cartItemId, cartId: activeCart.id },
    });

    if (!existingItem) {
      throw new NotFoundError('Cart item not found in your active cart');
    }

    await prisma.cartItem.delete({ where: { id: cartItemId } });
    return this.getCartSummary(guestSession);
  }

  async clearCart(guestSession: GuestSessionContext) {
    const activeCart = await this.ensureActiveCart(guestSession.id);
    await prisma.cartItem.deleteMany({ where: { cartId: activeCart.id } });
    return this.getCartSummary(guestSession);
  }
}

export const cartService = new CartService();
