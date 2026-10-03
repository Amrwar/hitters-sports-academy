import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type AuditInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  locationId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
};

/** Append-only audit trail. Accepts a transaction client so the log is written atomically with the change. */
export async function audit(input: AuditInput, tx: Prisma.TransactionClient | typeof db = db): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      locationId: input.locationId ?? null,
      metadata: input.metadata,
      ip: input.ip ?? null,
    },
  });
}
