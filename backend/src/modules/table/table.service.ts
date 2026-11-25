import { Prisma, TableStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { buildQrMenuPath, generateSecureToken, hashQrToken } from '../../utils/token.js';
import { recordAuditLog } from '../../utils/audit.js';
import { CreateTableInput, RotateQrInput, UpdateTableInput } from './table.schema.js';

export class TableService {
  async listTables(restaurantId: string, branchId?: string) {
    return prisma.diningTable.findMany({
      where: {
        branch: {
          restaurantId,
          ...(branchId ? { id: branchId } : {}),
        },
      },
      orderBy: [{ branchId: 'asc' }, { tableCode: 'asc' }],
      include: {
        branch: { select: { id: true, name: true } },
        qrTokens: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            createdAt: true,
            expiresAt: true,
          },
        },
      },
    });
  }

  async createTable(restaurantId: string, input: CreateTableInput, actorUserId: string) {
    const [branch, existingTable, tableCount, latestSub] = await Promise.all([
      prisma.branch.findFirst({
        where: { id: input.branchId, restaurantId },
        include: { restaurant: { select: { slug: true } } },
      }),
      prisma.diningTable.findUnique({
        where: {
          branchId_tableCode: {
            branchId: input.branchId,
            tableCode: input.tableCode.toUpperCase(),
          },
        },
      }),
      prisma.diningTable.count({
        where: { branch: { restaurantId } },
      }),
      prisma.restaurantSubscription.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      }),
    ]);

    if (!branch) {
      throw new NotFoundError('Branch not found for this restaurant');
    }
    if (existingTable) {
      throw new ConflictError(`Table code "${input.tableCode}" already exists in this branch`);
    }

    const featureConfig = latestSub?.plan?.featureConfig as { maxTables?: number } | null;
    if (featureConfig?.maxTables && tableCount >= featureConfig.maxTables) {
      throw new ForbiddenError(
        `Your current plan allows a maximum of ${featureConfig.maxTables} dining tables`
      );
    }

    const rawToken = generateSecureToken(32);
    const tokenHash = hashQrToken(rawToken);
    const normalizedCode = input.tableCode.toUpperCase();

    return prisma.$transaction(async (tx) => {
      const table = await tx.diningTable.create({
        data: {
          branchId: branch.id,
          tableCode: normalizedCode,
          displayName: input.displayName,
          capacity: input.capacity,
          status: TableStatus.ACTIVE,
        },
      });

      const qrToken = await tx.qRToken.create({
        data: {
          diningTableId: table.id,
          tokenHash,
          status: 'ACTIVE',
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          expiresAt: true,
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'TABLE_CREATED',
        entityType: 'DiningTable',
        entityId: table.id,
        metadata: { branchId: branch.id, tableCode: table.tableCode },
      });

      return {
        table,
        qrToken,
        qrCredentials: {
          rawToken,
          qrPath: buildQrMenuPath(branch.restaurant.slug, table.tableCode, rawToken, branch.id),
        },
      };
    });
  }

  async updateTable(
    restaurantId: string,
    tableId: string,
    input: UpdateTableInput,
    actorUserId: string
  ) {
    const existing = await prisma.diningTable.findFirst({
      where: {
        id: tableId,
        branch: { restaurantId },
      },
    });

    if (!existing) {
      throw new NotFoundError('Dining table not found for this restaurant');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.diningTable.update({
        where: { id: tableId },
        data: {
          displayName: input.displayName,
          capacity: input.capacity,
          status: input.status,
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'TABLE_UPDATED',
        entityType: 'DiningTable',
        entityId: tableId,
        metadata: input as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  async rotateQrToken(
    restaurantId: string,
    tableId: string,
    input: RotateQrInput,
    actorUserId: string
  ) {
    const table = await prisma.diningTable.findFirst({
      where: {
        id: tableId,
        branch: { restaurantId },
      },
      include: {
        branch: {
          include: { restaurant: { select: { slug: true } } },
        },
      },
    });

    if (!table) {
      throw new NotFoundError('Dining table not found for this restaurant');
    }

    const rawToken = generateSecureToken(32);
    const tokenHash = hashQrToken(rawToken);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      await tx.qRToken.updateMany({
        where: { diningTableId: table.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now },
      });

      const qrToken = await tx.qRToken.create({
        data: {
          diningTableId: table.id,
          tokenHash,
          status: 'ACTIVE',
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          expiresAt: true,
        },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'QR_TOKEN_ROTATED',
        entityType: 'DiningTable',
        entityId: table.id,
        metadata: { newTokenId: qrToken.id, tableCode: table.tableCode },
      });

      return {
        tableId: table.id,
        qrToken,
        qrCredentials: {
          rawToken,
          qrPath: buildQrMenuPath(
            table.branch.restaurant.slug,
            table.tableCode,
            rawToken,
            table.branchId
          ),
        },
      };
    });
  }

  async revokeQrTokens(restaurantId: string, tableId: string, actorUserId: string) {
    const table = await prisma.diningTable.findFirst({
      where: {
        id: tableId,
        branch: { restaurantId },
      },
    });

    if (!table) {
      throw new NotFoundError('Dining table not found for this restaurant');
    }

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const result = await tx.qRToken.updateMany({
        where: { diningTableId: table.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now },
      });

      await recordAuditLog(tx, {
        actorUserId,
        restaurantId,
        action: 'QR_TOKEN_REVOKED',
        entityType: 'DiningTable',
        entityId: table.id,
        metadata: { revokedCount: result.count, tableCode: table.tableCode },
      });

      return { tableId: table.id, revokedCount: result.count };
    });
  }
}

export const tableService = new TableService();
