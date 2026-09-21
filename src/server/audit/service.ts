import type { ActorType, Prisma } from '@prisma/client';
import type { Tx } from '../db/client';
import type { Actor } from '../authz/actor';
import { actorLabel } from '../authz/actor';

/**
 * Append-only audit and ticket-activity writers (docs/DATA_MODEL.md §4). Both are always
 * called inside the same transaction as the change they describe, so a ticket can never show
 * a state whose history is missing.
 */

function actorTypeOf(actor: Actor): ActorType {
  if (actor.kind === 'user') return 'USER';
  if (actor.kind === 'guest') return 'GUEST';
  return 'SYSTEM';
}

export type ActivityInput = {
  ticketId: string;
  action: string;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  /** PUBLIC events appear on the reporter's timeline; INTERNAL ones do not. */
  visibility?: 'PUBLIC' | 'INTERNAL' | 'QA_NOTE' | 'DEV_NOTE' | 'SYSTEM';
};

export async function recordActivity(tx: Tx, actor: Actor, input: ActivityInput): Promise<void> {
  await tx.ticketActivity.create({
    data: {
      ticketId: input.ticketId,
      actorType: actorTypeOf(actor),
      actorId:
        actor.kind === 'user' ? actor.id : actor.kind === 'guest' ? actor.guestReporterId : null,
      actorLabel: actorLabel(actor),
      action: input.action,
      field: input.field,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      visibility: input.visibility ?? 'PUBLIC',
    },
  });
}

export type AuditInput = {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

export async function recordAudit(tx: Tx, actor: Actor, input: AuditInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorType: actorTypeOf(actor),
      actorUserId: actor.kind === 'user' ? actor.id : null,
      actorLabel: actorLabel(actor),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
