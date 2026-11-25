import { ItemAvailability, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import { recordAuditLog } from '../../utils/audit.js';
import {
  CreateCategoryInput,
  CreateMenuItemInput,
  CreateModifierGroupInput,
  CreateTaxRuleInput,
  UpdateCategoryInput,
  UpdateMenuItemInput,
  UpdateModifierGroupInput,
  UpdateTaxRuleInput,
} from './menu.schema.js';

export class MenuService {
  async getCatalog(restaurantId: string, branchId?: string) {
    const categories = await prisma.menuCategory.findMany({
      where: {
        restaurantId,
        ...(branchId ? { OR: [{ branchId: null }, { branchId }] } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        items: {
          orderBy: { name: 'asc' },
          include: {
            modifierGroups: {
              orderBy: { sortOrder: 'asc' },
              include: {
                modifierGroup: {
                  include: {
                    options: {
                      orderBy: { sortOrder: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const modifierGroups = await prisma.modifierGroup.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
      },
    });

    const taxRules = await prisma.taxRule.findMany({
      where: {
        restaurantId,
        ...(branchId ? { OR: [{ branchId: null }, { branchId }] } : {}),
      },
      orderBy: { name: 'asc' },
    });

    return { categories, modifierGroups, taxRules };
  }

  // ----------------------------------------------------
  // CATEGORIES
  // ----------------------------------------------------

  async createCategory(restaurantId: string, input: CreateCategoryInput, actorUserId: string) {
    if (input.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: input.branchId, restaurantId },
      });
      if (!branch) {
        throw new NotFoundError('Branch not found for this restaurant');
      }
    }

    return prisma.$transaction(async (tx) => {
      const category = await tx.menuCategory.create({
        data: {
          restaurantId,
          branchId: input.branchId ?? null,
          name: input.name.trim(),
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'MENU_CATEGORY_CREATED',
        entityType: 'MenuCategory',
        entityId: category.id,
        metadata: { name: category.name },
      });

      return category;
    });
  }

  async updateCategory(
    restaurantId: string,
    categoryId: string,
    input: UpdateCategoryInput,
    actorUserId: string
  ) {
    const existing = await prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId },
    });
    if (!existing) {
      throw new NotFoundError('Menu category not found for this restaurant');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.menuCategory.update({
        where: { id: categoryId },
        data: {
          name: input.name?.trim(),
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'MENU_CATEGORY_UPDATED',
        entityType: 'MenuCategory',
        entityId: categoryId,
        metadata: input as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  async reorderCategories(
    restaurantId: string,
    items: { id: string; sortOrder: number }[],
    actorUserId: string
  ) {
    const ids = items.map((i) => i.id);
    const ownedCount = await prisma.menuCategory.count({
      where: { restaurantId, id: { in: ids } },
    });

    if (ownedCount !== ids.length) {
      throw new NotFoundError('One or more menu categories do not belong to this restaurant');
    }

    return prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.menuCategory.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        });
      }

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'MENU_CATEGORIES_REORDERED',
        entityType: 'MenuCategory',
        metadata: { count: items.length },
      });

      return tx.menuCategory.findMany({
        where: { restaurantId },
        orderBy: { sortOrder: 'asc' },
      });
    });
  }

  async deleteCategory(
    restaurantId: string,
    categoryId: string,
    actorUserId: string,
    reassignToCategoryId?: string
  ) {
    const category = await prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId },
      include: { _count: { select: { items: true } } },
    });

    if (!category) {
      throw new NotFoundError('Menu category not found for this restaurant');
    }

    if (category._count.items > 0) {
      if (!reassignToCategoryId) {
        throw new BadRequestError(
          'Category contains menu items. Provide reassignToCategoryId to move items before deleting.'
        );
      }
      if (reassignToCategoryId === categoryId) {
        throw new BadRequestError('Cannot reassign items to the category being deleted');
      }

      const targetCategory = await prisma.menuCategory.findFirst({
        where: { id: reassignToCategoryId, restaurantId },
      });
      if (!targetCategory) {
        throw new NotFoundError('Target reassignment category not found for this restaurant');
      }
    }

    return prisma.$transaction(async (tx) => {
      if (category._count.items > 0 && reassignToCategoryId) {
        await tx.menuItem.updateMany({
          where: { categoryId },
          data: { categoryId: reassignToCategoryId },
        });
      }

      await tx.menuCategory.delete({ where: { id: categoryId } });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'MENU_CATEGORY_DELETED',
        entityType: 'MenuCategory',
        entityId: categoryId,
        metadata: {
          name: category.name,
          reassignedTo: reassignToCategoryId ?? null,
          reassignedItemCount: category._count.items,
        },
      });

      return { deletedCategoryId: categoryId, reassignedCount: category._count.items };
    });
  }

  // ----------------------------------------------------
  // MENU ITEMS
  // ----------------------------------------------------

  async createMenuItem(restaurantId: string, input: CreateMenuItemInput, actorUserId: string) {
    const category = await prisma.menuCategory.findFirst({
      where: { id: input.categoryId, restaurantId },
    });
    if (!category) {
      throw new NotFoundError('Menu category not found for this restaurant');
    }

    if (input.modifierGroupIds.length > 0) {
      const groupCount = await prisma.modifierGroup.count({
        where: { restaurantId, id: { in: input.modifierGroupIds } },
      });
      if (groupCount !== input.modifierGroupIds.length) {
        throw new NotFoundError('One or more modifier groups do not belong to this restaurant');
      }
    }

    return prisma.$transaction(async (tx) => {
      const item = await tx.menuItem.create({
        data: {
          categoryId: input.categoryId,
          name: input.name.trim(),
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          price: input.price,
          isVeg: input.isVeg,
          availabilityStatus: input.availabilityStatus,
          modifierGroups:
            input.modifierGroupIds.length > 0
              ? {
                  create: input.modifierGroupIds.map((groupId, idx) => ({
                    modifierGroupId: groupId,
                    sortOrder: idx,
                  })),
                }
              : undefined,
        },
        include: {
          modifierGroups: {
            include: { modifierGroup: { include: { options: true } } },
          },
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'MENU_ITEM_CREATED',
        entityType: 'MenuItem',
        entityId: item.id,
        metadata: { name: item.name, price: item.price.toString() },
      });

      return item;
    });
  }

  async updateMenuItem(
    restaurantId: string,
    itemId: string,
    input: UpdateMenuItemInput,
    actorUserId: string
  ) {
    const existing = await prisma.menuItem.findFirst({
      where: {
        id: itemId,
        category: { restaurantId },
      },
    });
    if (!existing) {
      throw new NotFoundError('Menu item not found for this restaurant');
    }

    if (input.categoryId) {
      const category = await prisma.menuCategory.findFirst({
        where: { id: input.categoryId, restaurantId },
      });
      if (!category) {
        throw new NotFoundError('Target category not found for this restaurant');
      }
    }

    if (input.modifierGroupIds !== undefined && input.modifierGroupIds.length > 0) {
      const groupCount = await prisma.modifierGroup.count({
        where: { restaurantId, id: { in: input.modifierGroupIds } },
      });
      if (groupCount !== input.modifierGroupIds.length) {
        throw new NotFoundError('One or more modifier groups do not belong to this restaurant');
      }
    }

    return prisma.$transaction(async (tx) => {
      if (input.modifierGroupIds !== undefined) {
        await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId: itemId } });
        if (input.modifierGroupIds.length > 0) {
          await tx.menuItemModifierGroup.createMany({
            data: input.modifierGroupIds.map((groupId, idx) => ({
              menuItemId: itemId,
              modifierGroupId: groupId,
              sortOrder: idx,
            })),
          });
        }
      }

      const updated = await tx.menuItem.update({
        where: { id: itemId },
        data: {
          categoryId: input.categoryId,
          name: input.name?.trim(),
          description: input.description,
          imageUrl: input.imageUrl,
          price: input.price,
          isVeg: input.isVeg,
          availabilityStatus: input.availabilityStatus,
        },
        include: {
          modifierGroups: {
            include: { modifierGroup: { include: { options: true } } },
          },
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'MENU_ITEM_UPDATED',
        entityType: 'MenuItem',
        entityId: itemId,
        metadata: { name: updated.name, availabilityStatus: updated.availabilityStatus },
      });

      return updated;
    });
  }

  async updateItemAvailability(
    restaurantId: string,
    itemId: string,
    availabilityStatus: ItemAvailability,
    actorUserId: string
  ) {
    const existing = await prisma.menuItem.findFirst({
      where: {
        id: itemId,
        category: { restaurantId },
      },
    });
    if (!existing) {
      throw new NotFoundError('Menu item not found for this restaurant');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.menuItem.update({
        where: { id: itemId },
        data: { availabilityStatus },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'MENU_ITEM_AVAILABILITY_CHANGED',
        entityType: 'MenuItem',
        entityId: itemId,
        metadata: {
          previous: existing.availabilityStatus,
          current: updated.availabilityStatus,
        },
      });

      return updated;
    });
  }

  async deleteMenuItem(restaurantId: string, itemId: string, actorUserId: string) {
    const existing = await prisma.menuItem.findFirst({
      where: {
        id: itemId,
        category: { restaurantId },
      },
    });
    if (!existing) {
      throw new NotFoundError('Menu item not found for this restaurant');
    }

    return prisma.$transaction(async (tx) => {
      await tx.menuItem.delete({ where: { id: itemId } });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'MENU_ITEM_DELETED',
        entityType: 'MenuItem',
        entityId: itemId,
        metadata: { name: existing.name },
      });

      return { deletedItemId: itemId };
    });
  }

  // ----------------------------------------------------
  // MODIFIER GROUPS
  // ----------------------------------------------------

  async createModifierGroup(
    restaurantId: string,
    input: CreateModifierGroupInput,
    actorUserId: string
  ) {
    return prisma.$transaction(async (tx) => {
      const group = await tx.modifierGroup.create({
        data: {
          restaurantId,
          name: input.name.trim(),
          minSelect: input.minSelect,
          maxSelect: input.maxSelect,
          isRequired: input.isRequired,
          options: {
            create: input.options.map((opt, idx) => ({
              name: opt.name.trim(),
              priceDelta: opt.priceDelta,
              isAvailable: opt.isAvailable,
              sortOrder: opt.sortOrder ?? idx,
            })),
          },
        },
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'MODIFIER_GROUP_CREATED',
        entityType: 'ModifierGroup',
        entityId: group.id,
        metadata: { name: group.name, optionsCount: group.options.length },
      });

      return group;
    });
  }

  async updateModifierGroup(
    restaurantId: string,
    groupId: string,
    input: UpdateModifierGroupInput,
    actorUserId: string
  ) {
    const existing = await prisma.modifierGroup.findFirst({
      where: { id: groupId, restaurantId },
    });
    if (!existing) {
      throw new NotFoundError('Modifier group not found for this restaurant');
    }

    const nextMin = input.minSelect ?? existing.minSelect;
    const nextMax = input.maxSelect ?? existing.maxSelect;
    if (nextMax < nextMin) {
      throw new BadRequestError('maxSelect cannot be less than minSelect');
    }

    return prisma.$transaction(async (tx) => {
      if (input.options) {
        await tx.modifierOption.deleteMany({ where: { modifierGroupId: groupId } });
        await tx.modifierOption.createMany({
          data: input.options.map((opt, idx) => ({
            modifierGroupId: groupId,
            name: opt.name.trim(),
            priceDelta: opt.priceDelta,
            isAvailable: opt.isAvailable,
            sortOrder: opt.sortOrder ?? idx,
          })),
        });
      }

      const updated = await tx.modifierGroup.update({
        where: { id: groupId },
        data: {
          name: input.name?.trim(),
          minSelect: input.minSelect,
          maxSelect: input.maxSelect,
          isRequired: input.isRequired,
        },
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'MODIFIER_GROUP_UPDATED',
        entityType: 'ModifierGroup',
        entityId: groupId,
        metadata: { name: updated.name },
      });

      return updated;
    });
  }

  // ----------------------------------------------------
  // TAX RULES
  // ----------------------------------------------------

  async createTaxRule(restaurantId: string, input: CreateTaxRuleInput, actorUserId: string) {
    if (input.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: input.branchId, restaurantId },
      });
      if (!branch) {
        throw new NotFoundError('Branch not found for this restaurant');
      }
    }

    return prisma.$transaction(async (tx) => {
      const rule = await tx.taxRule.create({
        data: {
          restaurantId,
          branchId: input.branchId ?? null,
          name: input.name.trim(),
          rate: input.rate,
          calculationType: input.calculationType,
          isActive: input.isActive,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'TAX_RULE_CREATED',
        entityType: 'TaxRule',
        entityId: rule.id,
        metadata: { name: rule.name, rate: rule.rate.toString() },
      });

      return rule;
    });
  }

  async updateTaxRule(
    restaurantId: string,
    taxRuleId: string,
    input: UpdateTaxRuleInput,
    actorUserId: string
  ) {
    const existing = await prisma.taxRule.findFirst({
      where: { id: taxRuleId, restaurantId },
    });
    if (!existing) {
      throw new NotFoundError('Tax rule not found for this restaurant');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.taxRule.update({
        where: { id: taxRuleId },
        data: {
          name: input.name?.trim(),
          rate: input.rate,
          calculationType: input.calculationType,
          isActive: input.isActive,
          effectiveTo:
            input.effectiveTo === null
              ? null
              : input.effectiveTo
              ? new Date(input.effectiveTo)
              : undefined,
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'TAX_RULE_UPDATED',
        entityType: 'TaxRule',
        entityId: taxRuleId,
        metadata: { name: updated.name, isActive: updated.isActive },
      });

      return updated;
    });
  }
}

export const menuService = new MenuService();
