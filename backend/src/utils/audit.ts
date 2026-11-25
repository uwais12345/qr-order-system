import { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface AuditLogInput {
  actorUserId?: string | null;
  restaurantId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Records an immutable audit trail entry for sensitive Super Admin or restaurant operations.
 */
export async function recordAuditLog(db: DbClient, input: AuditLogInput) {
  return db.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      restaurantId: input.restaurantId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata,
    },
  });
}
