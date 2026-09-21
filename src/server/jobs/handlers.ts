import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { logger } from '@/lib/logger';
import { getMailer } from '../notifications/mailer';
import { renderEmail, type TemplateData, type TemplateName } from '../notifications/templates';
import { pruneExpired } from '../auth/rate-limit';
import { evaluateState } from '../sla/engine';
import { transitionTicket } from '../tickets/service';

/** Job handlers. Each must be safe to run twice (docs/NOTIFICATION_ARCHITECTURE.md §4). */
export type Handler = (payload: Record<string, unknown>) => Promise<void>;

const sendEmail: Handler = async (payload) => {
  const template = payload.template as TemplateName;
  const to = payload.to as string;
  const ticketId = (payload.ticketId as string) ?? null;
  const data = payload.data as unknown as TemplateData;

  // Honour the suppression list: a hard bounce must not be retried forever (T11).
  const suppressed = await prisma.emailDelivery.findFirst({
    where: { toAddress: to, status: 'SUPPRESSED' },
    select: { id: true },
  });
  const rendered = renderEmail(template, data);

  const delivery = await prisma.emailDelivery.create({
    data: {
      template,
      toAddress: to,
      subject: rendered.subject,
      ticketId,
      status: suppressed ? 'SUPPRESSED' : 'QUEUED',
    },
  });
  if (suppressed) return;

  try {
    const result = await getMailer().send({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        providerMessageId: result.messageId,
        attempts: { increment: 1 },
      },
    });
  } catch (error) {
    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: { status: 'FAILED', error: String(error).slice(0, 1000), attempts: { increment: 1 } },
    });
    throw error; // let the queue retry with backoff
  }
};

const autoClose: Handler = async (payload) => {
  const ticketId = payload.ticketId as string;
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { status: true },
  });
  if (!ticket || ticket.status !== 'RESOLVED') return; // reporter already acted — nothing to do
  await transitionTicket(
    { kind: 'system' },
    { ticketId, to: 'CLOSED', note: 'Automatically closed after the confirmation period.' },
  );
};

const scanAttachment: Handler = async (payload) => {
  const attachmentId = payload.attachmentId as string;
  // Scanner driver is not yet chosen (docs/PRODUCT_REQUIREMENTS.md A10). The gate exists and
  // the status is recorded so a real scanner is a one-file change.
  await prisma.ticketAttachment.updateMany({
    where: { id: attachmentId, scanStatus: 'PENDING' },
    data: { scanStatus: 'SKIPPED' },
  });
};

const slaSweep: Handler = async () => {
  const now = new Date();
  const instances = await prisma.slaInstance.findMany({
    where: { state: { in: ['OK', 'WARNING'] }, resolutionMetAt: null },
    include: {
      policy: { select: { warningThresholdPct: true } },
      ticket: {
        select: { id: true, key: true, title: true, supportOwnerId: true, qaOwnerId: true },
      },
    },
    take: 500,
  });

  for (const instance of instances) {
    const state = evaluateState(
      {
        firstResponseDueAt: instance.firstResponseDueAt,
        resolutionDueAt: instance.resolutionDueAt,
        firstResponseMetAt: instance.firstResponseMetAt,
        resolutionMetAt: instance.resolutionMetAt,
        pausedAt: instance.pausedAt,
        pausedMs: instance.pausedMs,
        warningThresholdPct: instance.policy.warningThresholdPct,
        createdAt: instance.createdAt,
      },
      now,
    );
    if (state === instance.state) continue;

    await prisma.$transaction(async (tx) => {
      await tx.slaInstance.update({
        where: { id: instance.id },
        data: { state, breachedResolution: state === 'BREACHED' },
      });
      const owners = [instance.ticket.supportOwnerId, instance.ticket.qaOwnerId].filter(
        (id): id is string => Boolean(id),
      );
      for (const userId of owners) {
        await tx.notification.create({
          data: {
            userId,
            type: state === 'BREACHED' ? 'SLA_BREACHED' : 'SLA_WARNING',
            title: `${instance.ticket.key} SLA ${state === 'BREACHED' ? 'breached' : 'warning'}`,
            body: instance.ticket.title,
            ticketId: instance.ticket.id,
          },
        });
      }
    });
  }
  logger.info('sla.sweep_complete', { evaluated: instances.length });
};

const maintenance: Handler = async () => {
  const pruned = await pruneExpired();
  const { count } = await prisma.job.deleteMany({
    where: { status: 'DONE', updatedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
  });
  logger.info('maintenance.complete', { rateLimitBucketsPruned: pruned, jobsPruned: count });
};

export const HANDLERS: Record<string, Handler> = {
  'email.send': sendEmail,
  'ticket.auto_close': autoClose,
  'attachment.scan': scanAttachment,
  'sla.sweep': slaSweep,
  'maintenance.prune': maintenance,
};

export function payloadOf(raw: Prisma.JsonValue): Record<string, unknown> {
  return (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
}
