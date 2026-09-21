import 'server-only';
import { prisma } from '../db/client';
import { getEnv } from '../config/env';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import type { Actor } from '../authz/actor';
import { can, requirePermission } from '../authz/policy';
import { getTicketById } from '../tickets/service';
import { recordActivity } from '../audit/service';
import { checksum, getStorage, newStorageKey } from './storage';
import { extensionOf, validateUpload } from './validation';

/** Upload pipeline: authorise → validate → store under a random key → record → queue scan. */
export async function uploadAttachment(
  actor: Actor,
  input: { ticketId: string; file: File; visibility?: 'PUBLIC' | 'INTERNAL'; commentId?: string },
) {
  const ticket = await getTicketById(actor, input.ticketId);
  requirePermission(actor, 'attachment.upload', ticket);

  const env = getEnv();
  const existingCount = await prisma.ticketAttachment.count({ where: { ticketId: ticket.id } });
  const bytes = Buffer.from(await input.file.arrayBuffer());

  validateUpload(
    {
      filename: input.file.name,
      mimeType: input.file.type,
      sizeBytes: bytes.byteLength,
      head: bytes.subarray(0, 16),
    },
    {
      maxBytes: env.MAX_ATTACHMENT_MB * 1024 * 1024,
      maxPerTicket: env.MAX_ATTACHMENTS_PER_TICKET,
      existingCount,
    },
  );

  // Guests may never create internal attachments.
  const visibility = actor.kind === 'guest' ? 'PUBLIC' : (input.visibility ?? 'PUBLIC');

  const storageKey = newStorageKey(ticket.id, extensionOf(input.file.name));
  await getStorage().put(storageKey, bytes, input.file.type);

  return prisma.$transaction(async (tx) => {
    const attachment = await tx.ticketAttachment.create({
      data: {
        ticketId: ticket.id,
        commentId: input.commentId ?? null,
        storageKey,
        filename: input.file.name.slice(0, 255),
        mimeType: input.file.type,
        sizeBytes: bytes.byteLength,
        checksum: checksum(bytes),
        visibility,
        scanStatus: 'PENDING',
        uploadedById: actor.kind === 'user' ? actor.id : null,
        uploadedByGuest: actor.kind === 'guest',
      },
    });

    await recordActivity(tx, actor, {
      ticketId: ticket.id,
      action: 'attachment.added',
      newValue: attachment.filename,
      visibility: visibility === 'PUBLIC' ? 'PUBLIC' : 'INTERNAL',
    });

    await tx.job.create({
      data: { type: 'attachment.scan', payload: { attachmentId: attachment.id } },
    });
    return attachment;
  });
}

/** Authorisation for download. The signature is checked separately by the route handler. */
export async function getDownloadableAttachment(actor: Actor, attachmentId: string) {
  const attachment = await prisma.ticketAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      ticket: {
        select: {
          id: true,
          reporterUserId: true,
          guestReporterId: true,
          supportOwnerId: true,
          qaOwnerId: true,
          developerId: true,
        },
      },
    },
  });
  if (!attachment) throw new NotFoundError('Attachment not found');

  if (!can(actor, 'attachment.download', attachment.ticket))
    throw new NotFoundError('Attachment not found');
  if (
    attachment.visibility === 'INTERNAL' &&
    !can(actor, 'comment.read.internal', attachment.ticket)
  ) {
    throw new NotFoundError('Attachment not found');
  }
  if (attachment.scanStatus === 'INFECTED') {
    throw new ForbiddenError('This file was blocked by the malware scanner');
  }

  const data = await getStorage().get(attachment.storageKey);
  return { attachment, data };
}
