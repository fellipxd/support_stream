import 'server-only';
import type { Prisma, Severity, TeamKind, TicketStatus } from '@prisma/client';
import { prisma, type Tx } from '../db/client';
import { getEnv } from '../config/env';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import type { Actor } from '../authz/actor';
import {
  can,
  requirePermission,
  ticketScopeWhere,
  visibleCommentVisibilities,
} from '../authz/policy';
import { assertTransition, type TransitionContext } from './lifecycle';
import { DEFAULT_PREFIX, reserveKey } from './keys';
import { route } from '../routing/engine';
import { computeDeadlines } from '../sla/engine';
import { recordActivity, recordAudit } from '../audit/service';
import {
  commentPreview,
  dispatch,
  reporterTemplateForStatus,
  type TicketForNotification,
} from '../notifications/service';
import type { ReportIssueInput } from '../validation/schemas';
import { logger } from '@/lib/logger';

/**
 * The ticket domain service. Every mutation here is a single transaction that writes the
 * change, its activity trail, its notifications and its jobs together (§41 of the brief).
 */

export const TICKET_INCLUDE = {
  portal: { select: { id: true, name: true, slug: true } },
  project: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  reporterUser: { select: { id: true, name: true, email: true } },
  guestReporter: { select: { id: true, name: true, email: true } },
  supportOwner: { select: { id: true, name: true, email: true } },
  qaOwner: { select: { id: true, name: true, email: true } },
  developer: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TicketInclude;

function transitionContext(extra?: Partial<TransitionContext>): TransitionContext {
  return { reopenWindowDays: getEnv().REOPEN_WINDOW_DAYS, now: new Date(), ...extra };
}

function buildSearchText(input: {
  key: string;
  title: string;
  description: string;
  reporterName?: string | null;
  reporterEmail?: string | null;
}): string {
  return [input.key, input.title, input.description, input.reporterName, input.reporterEmail]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .slice(0, 8000);
}

async function notificationTicket(tx: Tx, ticketId: string): Promise<TicketForNotification> {
  const ticket = await tx.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    include: {
      portal: { select: { name: true } },
      category: { select: { name: true } },
      guestReporter: { select: { id: true, email: true, name: true } },
      reporterUser: { select: { id: true, email: true, name: true } },
    },
  });
  return ticket as TicketForNotification;
}

/** Everyone currently working the ticket, for in-app notification. */
function staffOf(ticket: {
  supportOwner?: { id: string; name: string; email: string } | null;
  qaOwner?: { id: string; name: string; email: string } | null;
  developer?: { id: string; name: string; email: string } | null;
}) {
  return [ticket.supportOwner, ticket.qaOwner, ticket.developer]
    .filter((p): p is { id: string; name: string; email: string } => Boolean(p))
    .map((p) => ({ userId: p.id, name: p.name, email: p.email }));
}

// ---------------------------------------------------------------- creation

export type CreateTicketResult = { id: string; key: string; guestToken?: string };

export async function createTicket(
  actor: Actor,
  input: ReportIssueInput,
  meta?: { ip?: string; userAgent?: string },
): Promise<CreateTicketResult> {
  requirePermission(actor, 'ticket.create');

  const portal = await prisma.portal.findFirst({
    where: { id: input.portalId, isActive: true },
    include: { projects: { where: { isActive: true } } },
  });
  if (!portal)
    throw new ValidationError('Select a portal', {
      fieldErrors: { portalId: ['Select the portal you were using'] },
    });

  if (input.categoryId) {
    const category = await prisma.ticketCategory.findFirst({
      where: { id: input.categoryId, portalId: portal.id, isActive: true },
      select: { id: true },
    });
    if (!category) {
      throw new ValidationError('Select a category', {
        fieldErrors: { categoryId: ['Choose a category for this portal'] },
      });
    }
  }

  // Guests must identify themselves; authenticated reporters are taken from the session.
  if (actor.kind !== 'user' && (!input.reporterName || !input.reporterEmail)) {
    throw new ValidationError('Your name and email are required', {
      fieldErrors: {
        ...(input.reporterName ? {} : { reporterName: ['Enter your name'] }),
        ...(input.reporterEmail ? {} : { reporterEmail: ['Enter your email address'] }),
      },
    });
  }

  const severity: Severity = 'S3_MEDIUM';
  const rules = await prisma.routingRule.findMany({ where: { isActive: true } });
  const routed = route(rules, {
    portalId: portal.id,
    categoryId: input.categoryId || null,
    severity,
  });
  const projectId =
    routed.projectId ??
    portal.projects.find((p) => p.isDefault)?.id ??
    portal.projects[0]?.id ??
    null;

  const project = projectId ? await prisma.project.findUnique({ where: { id: projectId } }) : null;
  const prefix = project?.keyPrefix || DEFAULT_PREFIX;

  const slaPolicy = await prisma.slaPolicy.findFirst({
    where: { severity, isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  const result = await prisma.$transaction(async (tx) => {
    const key = await reserveKey(tx, prefix);

    const guestReporter =
      actor.kind === 'user'
        ? null
        : await tx.guestReporter.create({
            data: {
              name: input.reporterName!,
              email: input.reporterEmail!,
              phone: input.reporterPhone || null,
              organization: input.reporterOrganization || null,
            },
          });

    const reporterName = actor.kind === 'user' ? actor.name : guestReporter?.name;
    const reporterEmail = actor.kind === 'user' ? actor.email : guestReporter?.email;

    const ticket = await tx.ticket.create({
      data: {
        key,
        organizationId: portal.organizationId,
        portalId: portal.id,
        projectId,
        categoryId: input.categoryId || null,
        status: 'NEW',
        severity,
        title: input.title,
        description: input.description,
        whatTrying: input.whatTrying || null,
        whatHappened: input.whatHappened || null,
        whatExpected: input.whatExpected || null,
        frequency: input.frequency || null,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
        browser: input.browser || null,
        os: input.os || null,
        device: input.device || null,
        pageUrl: input.pageUrl || null,
        reporterUserId: actor.kind === 'user' ? actor.id : null,
        guestReporterId: guestReporter?.id ?? null,
        supportTeamId: routed.supportTeamId,
        qaTeamId: routed.qaTeamId,
        searchText: buildSearchText({
          key,
          title: input.title,
          description: input.description,
          reporterName,
          reporterEmail,
        }),
      },
    });

    if (slaPolicy) {
      const { firstResponseDueAt, resolutionDueAt } = computeDeadlines(slaPolicy, ticket.createdAt);
      await tx.slaInstance.create({
        data: { ticketId: ticket.id, policyId: slaPolicy.id, firstResponseDueAt, resolutionDueAt },
      });
    }

    await recordActivity(tx, actor, {
      ticketId: ticket.id,
      action: 'ticket.created',
      newValue: key,
      visibility: 'PUBLIC',
    });
    if (routed.matchedRuleId) {
      await recordActivity(
        tx,
        { kind: 'system' },
        {
          ticketId: ticket.id,
          action: 'ticket.routed',
          field: 'project',
          newValue: project?.name ?? null,
          visibility: 'INTERNAL',
        },
      );
    }
    await recordAudit(tx, actor, {
      action: 'ticket.created',
      entityType: 'Ticket',
      entityId: ticket.id,
      after: { key, portalId: portal.id, status: 'NEW' },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    // Queue notifications: the reporter gets an acknowledgement; the support queue is alerted.
    const notifTicket = await notificationTicket(tx, ticket.id);
    const supportTeamMembers = routed.supportTeamId
      ? await tx.teamMember.findMany({
          where: { teamId: routed.supportTeamId },
          include: { user: { select: { id: true, name: true, email: true } } },
        })
      : [];

    await dispatch(tx, {
      ticket: notifTicket,
      type: 'TICKET_CREATED',
      title: `New ticket ${key}`,
      body: input.title,
      actorUserId: actor.kind === 'user' ? actor.id : null,
      staff: supportTeamMembers.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
      })),
      reporter: { template: 'ticket_received' },
    });

    return { id: ticket.id, key };
  });

  logger.info('ticket.created', { ticketKey: result.key, portal: portal.slug, actor: actor.kind });
  return result;
}

// ---------------------------------------------------------------- reads

export async function getTicketByKey(actor: Actor, key: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { AND: [{ key: key.toUpperCase() }, ticketScopeWhere(actor)] },
    include: TICKET_INCLUDE,
  });
  // "Not yours" and "does not exist" are indistinguishable (docs/SECURITY_MODEL.md T1).
  if (!ticket) throw new NotFoundError('Ticket not found');
  return ticket;
}

export async function getTicketById(actor: Actor, id: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { AND: [{ id }, ticketScopeWhere(actor)] },
    include: TICKET_INCLUDE,
  });
  if (!ticket) throw new NotFoundError('Ticket not found');
  return ticket;
}

export async function getTimeline(actor: Actor, ticketId: string) {
  const ticket = await getTicketById(actor, ticketId);
  const visibilities = visibleCommentVisibilities(actor, ticket);

  const [comments, activities] = await Promise.all([
    prisma.ticketComment.findMany({
      where: { ticketId, visibility: { in: visibilities } },
      include: {
        authorUser: { select: { id: true, name: true } },
        guestReporter: { select: { id: true, name: true } },
        attachments: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.ticketActivity.findMany({
      where: { ticketId, visibility: { in: visibilities } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return { comments, activities };
}

export async function getAttachments(actor: Actor, ticketId: string) {
  const ticket = await getTicketById(actor, ticketId);
  const canSeeInternal = can(actor, 'comment.read.internal', ticket);
  return prisma.ticketAttachment.findMany({
    where: { ticketId, ...(canSeeInternal ? {} : { visibility: 'PUBLIC' }) },
    orderBy: { createdAt: 'desc' },
  });
}

// ---------------------------------------------------------------- triage

export type TriageInput = {
  ticketId: string;
  portalId?: string;
  categoryId?: string | null;
  severity: Severity;
  priority: 'P0_EMERGENCY' | 'P1_URGENT' | 'P2_NORMAL' | 'P3_LOW';
  projectId?: string | null;
};

export async function triageTicket(actor: Actor, input: TriageInput) {
  const existing = await getTicketById(actor, input.ticketId);
  requirePermission(actor, 'ticket.triage', existing);

  const rules = await prisma.routingRule.findMany({ where: { isActive: true } });
  const routed = route(rules, {
    portalId: input.portalId ?? existing.portalId,
    categoryId: input.categoryId ?? existing.categoryId,
    severity: input.severity,
  });

  const slaPolicy = await prisma.slaPolicy.findFirst({
    where: { severity: input.severity, isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  return prisma.$transaction(async (tx) => {
    const changes: Array<{ field: string; from: string | null; to: string | null }> = [];
    if (input.severity !== existing.severity)
      changes.push({ field: 'severity', from: existing.severity, to: input.severity });
    if (input.priority !== existing.priority)
      changes.push({ field: 'priority', from: existing.priority, to: input.priority });
    if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
      changes.push({ field: 'category', from: existing.categoryId, to: input.categoryId });
    }
    if (input.portalId && input.portalId !== existing.portalId) {
      changes.push({ field: 'portal', from: existing.portalId, to: input.portalId });
    }

    const projectId = input.projectId ?? routed.projectId ?? existing.projectId;

    const updated = await tx.ticket.update({
      where: { id: existing.id },
      data: {
        portalId: input.portalId ?? existing.portalId,
        categoryId: input.categoryId ?? existing.categoryId,
        severity: input.severity,
        priority: input.priority,
        projectId,
        supportTeamId: routed.supportTeamId ?? existing.supportTeamId,
        qaTeamId: routed.qaTeamId ?? existing.qaTeamId,
        status: existing.status === 'NEW' ? 'TRIAGE' : existing.status,
      },
      include: TICKET_INCLUDE,
    });

    for (const change of changes) {
      await recordActivity(tx, actor, {
        ticketId: existing.id,
        action: 'ticket.triaged',
        field: change.field,
        oldValue: change.from,
        newValue: change.to,
        visibility: 'PUBLIC',
      });
    }
    if (existing.status === 'NEW') {
      await recordActivity(tx, actor, {
        ticketId: existing.id,
        action: 'status.changed',
        field: 'status',
        oldValue: 'NEW',
        newValue: 'TRIAGE',
      });
    }
    await recordAudit(tx, actor, {
      action: 'ticket.triaged',
      entityType: 'Ticket',
      entityId: existing.id,
      before: {
        severity: existing.severity,
        priority: existing.priority,
        categoryId: existing.categoryId,
      },
      after: { severity: input.severity, priority: input.priority, categoryId: input.categoryId },
    });

    // Severity drives the SLA target, so re-derive deadlines when it changes.
    if (slaPolicy && input.severity !== existing.severity) {
      const { firstResponseDueAt, resolutionDueAt } = computeDeadlines(
        slaPolicy,
        updated.createdAt,
      );
      const instance = await tx.slaInstance.findFirst({
        where: { ticketId: existing.id },
        orderBy: { createdAt: 'desc' },
      });
      if (instance) {
        await tx.slaInstance.update({
          where: { id: instance.id },
          data: { policyId: slaPolicy.id, firstResponseDueAt, resolutionDueAt },
        });
      } else {
        await tx.slaInstance.create({
          data: {
            ticketId: existing.id,
            policyId: slaPolicy.id,
            firstResponseDueAt,
            resolutionDueAt,
          },
        });
      }
    }

    await markFirstResponse(tx, existing.id, actor);
    return updated;
  });
}

// ---------------------------------------------------------------- assignment

const ROLE_FIELD: Record<TeamKind, 'supportOwnerId' | 'qaOwnerId' | 'developerId'> = {
  SUPPORT: 'supportOwnerId',
  QA: 'qaOwnerId',
  ENGINEERING: 'developerId',
};

const ROLE_PERMISSION = {
  SUPPORT: 'ticket.assign.support',
  QA: 'ticket.assign.qa',
  ENGINEERING: 'ticket.assign.developer',
} as const;

const ROLE_LABEL: Record<TeamKind, string> = {
  SUPPORT: 'Support owner',
  QA: 'QA owner',
  ENGINEERING: 'Developer',
};

export async function assignTicket(
  actor: Actor,
  input: { ticketId: string; role: TeamKind; assigneeId: string | null },
) {
  const existing = await getTicketById(actor, input.ticketId);
  requirePermission(actor, ROLE_PERMISSION[input.role], existing);

  const assignee = input.assigneeId
    ? await prisma.user.findFirst({
        where: { id: input.assigneeId, status: 'ACTIVE' },
        select: { id: true, name: true, email: true },
      })
    : null;
  if (input.assigneeId && !assignee) throw new ValidationError('That person cannot be assigned');

  const field = ROLE_FIELD[input.role];
  const previousId = existing[field];

  return prisma.$transaction(async (tx) => {
    const shouldAssign = existing.status === 'TRIAGE' && input.role === 'SUPPORT' && assignee;
    const updated = await tx.ticket.update({
      where: { id: existing.id },
      data: {
        [field]: assignee?.id ?? null,
        ...(shouldAssign ? { status: 'ASSIGNED' as TicketStatus } : {}),
      },
      include: TICKET_INCLUDE,
    });

    if (previousId) {
      await tx.ticketAssignment.updateMany({
        where: { ticketId: existing.id, role: input.role, unassignedAt: null },
        data: { unassignedAt: new Date() },
      });
    }
    if (assignee) {
      await tx.ticketAssignment.create({
        data: {
          ticketId: existing.id,
          role: input.role,
          assigneeId: assignee.id,
          actorId: actor.kind === 'user' ? actor.id : null,
        },
      });
    }

    await recordActivity(tx, actor, {
      ticketId: existing.id,
      action: `assignment.${input.role.toLowerCase()}`,
      field: ROLE_LABEL[input.role],
      oldValue: previousId,
      newValue: assignee?.name ?? null,
      visibility: 'PUBLIC',
    });
    if (shouldAssign) {
      await recordActivity(tx, actor, {
        ticketId: existing.id,
        action: 'status.changed',
        field: 'status',
        oldValue: 'TRIAGE',
        newValue: 'ASSIGNED',
      });
    }
    await recordAudit(tx, actor, {
      action: 'ticket.assigned',
      entityType: 'Ticket',
      entityId: existing.id,
      before: { [field]: previousId },
      after: { [field]: assignee?.id ?? null },
    });

    if (assignee) {
      const notifTicket = await notificationTicket(tx, existing.id);
      await dispatch(tx, {
        ticket: notifTicket,
        type: 'TICKET_ASSIGNED',
        title: `${ROLE_LABEL[input.role]}: ${updated.key}`,
        body: `You have been assigned ${updated.key} — ${updated.title}`,
        actorUserId: actor.kind === 'user' ? actor.id : null,
        staff: [{ userId: assignee.id, name: assignee.name, email: assignee.email }],
        emailStaff: [{ userId: assignee.id, name: assignee.name, email: assignee.email }],
        staffTemplate: 'ticket_assigned',
        actorName: actor.kind === 'user' ? actor.name : 'The support team',
      });
    }

    await markFirstResponse(tx, existing.id, actor);
    return updated;
  });
}

// ---------------------------------------------------------------- transitions

export async function transitionTicket(
  actor: Actor,
  input: { ticketId: string; to: TicketStatus; note?: string; duplicateOfKey?: string },
) {
  const existing = await getTicketById(actor, input.ticketId);

  let duplicateOf: { id: string; key: string } | null = null;
  if (input.to === 'DUPLICATE') {
    if (!input.duplicateOfKey) throw new ValidationError('Provide the ticket this duplicates');
    duplicateOf = await prisma.ticket.findUnique({
      where: { key: input.duplicateOfKey.toUpperCase() },
      select: { id: true, key: true },
    });
    if (!duplicateOf) throw new ValidationError('That primary ticket does not exist');
    if (duplicateOf.id === existing.id)
      throw new ValidationError('A ticket cannot duplicate itself');
  }

  const ctx = transitionContext({
    hasDuplicateOf: Boolean(duplicateOf),
    incoming: { rejectionReason: input.note || null },
  });
  assertTransition(actor, existing, input.to, ctx);

  if (existing.status === input.to) return existing; // idempotent

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const data: Prisma.TicketUpdateInput = { status: input.to };
    if (input.to === 'RESOLVED') {
      data.resolvedAt = now;
      data.resolutionNote = input.note || null;
    }
    if (input.to === 'CLOSED') data.closedAt = now;
    if (input.to === 'REJECTED') data.rejectionReason = input.note || null;
    if (input.to === 'REOPENED') {
      data.reopenCount = { increment: 1 };
      data.resolvedAt = null;
      data.closedAt = null;
    }

    const updated = await tx.ticket.update({
      where: { id: existing.id },
      data,
      include: TICKET_INCLUDE,
    });

    if (duplicateOf) {
      await tx.ticketRelationship.upsert({
        where: {
          sourceTicketId_targetTicketId_type: {
            sourceTicketId: existing.id,
            targetTicketId: duplicateOf.id,
            type: 'DUPLICATE_OF',
          },
        },
        create: {
          sourceTicketId: existing.id,
          targetTicketId: duplicateOf.id,
          type: 'DUPLICATE_OF',
          createdById: actor.kind === 'user' ? actor.id : null,
        },
        update: {},
      });
    }

    await recordActivity(tx, actor, {
      ticketId: existing.id,
      action: 'status.changed',
      field: 'status',
      oldValue: existing.status,
      newValue: input.to,
      visibility: 'PUBLIC',
    });
    if (input.note) {
      await recordActivity(tx, actor, {
        ticketId: existing.id,
        action: 'status.note',
        newValue: input.note.slice(0, 500),
        visibility: input.to === 'RESOLVED' || input.to === 'REJECTED' ? 'PUBLIC' : 'INTERNAL',
      });
    }
    await recordAudit(tx, actor, {
      action: 'ticket.status_changed',
      entityType: 'Ticket',
      entityId: existing.id,
      before: { status: existing.status },
      after: { status: input.to },
    });

    await updateSlaForStatus(tx, existing.id, input.to, now);

    // Auto-close is scheduled, never immediate: the reporter gets a window to confirm or reopen.
    if (input.to === 'RESOLVED') {
      await tx.job.create({
        data: {
          type: 'ticket.auto_close',
          payload: { ticketId: existing.id },
          runAt: new Date(now.getTime() + getEnv().AUTO_CLOSE_DAYS * 86_400_000),
        },
      });
    }

    const notifTicket = await notificationTicket(tx, existing.id);
    const reporterTemplate = reporterTemplateForStatus(input.to);
    const recipients = staffOf(updated);
    const isQaHandoff = input.to === 'READY_FOR_QA';

    await dispatch(tx, {
      ticket: notifTicket,
      type:
        input.to === 'RESOLVED'
          ? 'TICKET_RESOLVED'
          : input.to === 'CLOSED'
            ? 'TICKET_CLOSED'
            : input.to === 'REOPENED'
              ? 'TICKET_REOPENED'
              : input.to === 'WAITING_FOR_USER'
                ? 'TICKET_INFO_REQUESTED'
                : isQaHandoff
                  ? 'TICKET_READY_FOR_QA'
                  : 'TICKET_STATUS_CHANGED',
      title: `${updated.key} — ${input.to.replace(/_/g, ' ').toLowerCase()}`,
      body: input.note
        ? input.note.slice(0, 300)
        : `Status changed from ${existing.status} to ${input.to}`,
      actorUserId: actor.kind === 'user' ? actor.id : null,
      staff: recipients,
      emailStaff:
        isQaHandoff && updated.qaOwner
          ? [
              {
                userId: updated.qaOwner.id,
                name: updated.qaOwner.name,
                email: updated.qaOwner.email,
              },
            ]
          : [],
      staffTemplate: isQaHandoff ? 'ticket_updated' : undefined,
      reporter: reporterTemplate
        ? { template: reporterTemplate, message: input.note || undefined }
        : null,
      actorName: actor.kind === 'user' ? actor.name : undefined,
    });

    await markFirstResponse(tx, existing.id, actor);
    logger.info('ticket.transitioned', {
      ticketKey: updated.key,
      from: existing.status,
      to: input.to,
    });
    return updated;
  });
}

/** SLA clock: pause while waiting on the reporter, stop when resolved, restart on reopen. */
async function updateSlaForStatus(tx: Tx, ticketId: string, status: TicketStatus, now: Date) {
  const instance = await tx.slaInstance.findFirst({
    where: { ticketId },
    orderBy: { createdAt: 'desc' },
  });
  if (!instance) return;

  if (status === 'WAITING_FOR_USER' && !instance.pausedAt) {
    await tx.slaInstance.update({ where: { id: instance.id }, data: { pausedAt: now } });
    return;
  }
  if (instance.pausedAt && status !== 'WAITING_FOR_USER') {
    await tx.slaInstance.update({
      where: { id: instance.id },
      data: {
        pausedAt: null,
        pausedMs: instance.pausedMs + (now.getTime() - instance.pausedAt.getTime()),
      },
    });
  }
  if (status === 'RESOLVED') {
    const metLate = now > instance.resolutionDueAt;
    await tx.slaInstance.update({
      where: { id: instance.id },
      data: {
        resolutionMetAt: now,
        state: metLate ? 'BREACHED' : 'MET',
        breachedResolution: metLate,
      },
    });
  }
  if (status === 'REOPENED') {
    await tx.slaInstance.update({
      where: { id: instance.id },
      data: { resolutionMetAt: null, state: 'OK' },
    });
  }
}

/** First staff response, recorded once — the basis of the first-response SLA and KPI. */
async function markFirstResponse(tx: Tx, ticketId: string, actor: Actor) {
  if (actor.kind !== 'user') return;
  const ticket = await tx.ticket.findUnique({
    where: { id: ticketId },
    select: { firstResponseAt: true, reporterUserId: true },
  });
  if (!ticket || ticket.firstResponseAt || ticket.reporterUserId === actor.id) return;

  const now = new Date();
  await tx.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: now } });
  const instance = await tx.slaInstance.findFirst({
    where: { ticketId },
    orderBy: { createdAt: 'desc' },
  });
  if (instance && !instance.firstResponseMetAt) {
    await tx.slaInstance.update({
      where: { id: instance.id },
      data: {
        firstResponseMetAt: now,
        breachedFirstResponse: now > instance.firstResponseDueAt,
      },
    });
  }
}

// ---------------------------------------------------------------- comments

export async function addComment(
  actor: Actor,
  input: {
    ticketId: string;
    body: string;
    visibility: 'PUBLIC' | 'INTERNAL' | 'QA_NOTE' | 'DEV_NOTE';
  },
) {
  const ticket = await getTicketById(actor, input.ticketId);

  if (input.visibility === 'PUBLIC') {
    requirePermission(actor, 'comment.create.public', ticket);
  } else {
    requirePermission(actor, 'comment.create.internal', ticket);
  }
  if (actor.kind === 'guest' && input.visibility !== 'PUBLIC') {
    throw new ForbiddenError('Guests may only add public comments');
  }

  return prisma.$transaction(async (tx) => {
    const comment = await tx.ticketComment.create({
      data: {
        ticketId: ticket.id,
        bodyMarkdown: input.body,
        visibility: input.visibility,
        authorUserId: actor.kind === 'user' ? actor.id : null,
        guestReporterId: actor.kind === 'guest' ? actor.guestReporterId : null,
      } as Prisma.TicketCommentUncheckedCreateInput,
      include: {
        authorUser: { select: { id: true, name: true } },
        guestReporter: { select: { id: true, name: true } },
      },
    });

    await recordActivity(tx, actor, {
      ticketId: ticket.id,
      action: 'comment.added',
      newValue: input.visibility,
      visibility: input.visibility === 'PUBLIC' ? 'PUBLIC' : 'INTERNAL',
    });

    // A reporter replying to an information request resumes the work automatically.
    const reporterReplied =
      ticket.status === 'WAITING_FOR_USER' &&
      ((actor.kind === 'guest' && actor.ticketId === ticket.id) ||
        (actor.kind === 'user' && ticket.reporterUserId === actor.id));

    if (reporterReplied) {
      await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'IN_PROGRESS' } });
      await recordActivity(
        tx,
        { kind: 'system' },
        {
          ticketId: ticket.id,
          action: 'status.changed',
          field: 'status',
          oldValue: 'WAITING_FOR_USER',
          newValue: 'IN_PROGRESS',
        },
      );
      await updateSlaForStatus(tx, ticket.id, 'IN_PROGRESS', new Date());
    }

    const notifTicket = await notificationTicket(tx, ticket.id);
    const isPublic = input.visibility === 'PUBLIC';

    await dispatch(tx, {
      ticket: notifTicket,
      type: 'TICKET_COMMENT',
      title: `New ${isPublic ? 'comment' : 'internal note'} on ${ticket.key}`,
      // Internal bodies stay internal: only staff ever see this text, and no reporter email
      // is produced for a non-public comment (docs/NOTIFICATION_ARCHITECTURE.md §2).
      body: commentPreview(input.body),
      actorUserId: actor.kind === 'user' ? actor.id : null,
      staff: staffOf(ticket),
      reporter:
        isPublic && actor.kind === 'user'
          ? { template: 'new_comment', message: commentPreview(input.body) }
          : null,
      actorName: actor.kind === 'user' ? actor.name : ticket.guestReporter?.name,
    });

    await markFirstResponse(tx, ticket.id, actor);
    return comment;
  });
}

// ---------------------------------------------------------------- listing

export type TicketListFilters = {
  q?: string;
  status?: TicketStatus[];
  portalId?: string;
  projectId?: string;
  categoryId?: string;
  severity?: Severity[];
  priority?: Array<'P0_EMERGENCY' | 'P1_URGENT' | 'P2_NORMAL' | 'P3_LOW'>;
  assigneeId?: string;
  reporterId?: string;
  from?: Date;
  to?: Date;
  page: number;
  perPage: number;
  sort: 'newest' | 'oldest' | 'priority' | 'updated';
};

const SORTS: Record<TicketListFilters['sort'], Prisma.TicketOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }],
  oldest: [{ createdAt: 'asc' }],
  priority: [{ priority: 'asc' }, { createdAt: 'asc' }],
  updated: [{ updatedAt: 'desc' }],
};

export async function listTickets(actor: Actor, filters: TicketListFilters) {
  const where: Prisma.TicketWhereInput = { AND: [ticketScopeWhere(actor)] };
  const and = where.AND as Prisma.TicketWhereInput[];

  if (filters.q) {
    const term = filters.q.trim().toLowerCase();
    and.push({
      OR: [
        { key: { equals: term.toUpperCase() } },
        { searchText: { contains: term } },
        { title: { contains: term, mode: 'insensitive' } },
      ],
    });
  }
  if (filters.status?.length) and.push({ status: { in: filters.status } });
  if (filters.portalId) and.push({ portalId: filters.portalId });
  if (filters.projectId) and.push({ projectId: filters.projectId });
  if (filters.categoryId) and.push({ categoryId: filters.categoryId });
  if (filters.severity?.length) and.push({ severity: { in: filters.severity } });
  if (filters.priority?.length) and.push({ priority: { in: filters.priority } });
  if (filters.reporterId) and.push({ reporterUserId: filters.reporterId });
  if (filters.assigneeId) {
    and.push({
      OR: [
        { supportOwnerId: filters.assigneeId },
        { qaOwnerId: filters.assigneeId },
        { developerId: filters.assigneeId },
      ],
    });
  }
  if (filters.from || filters.to) {
    and.push({
      createdAt: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      },
    });
  }

  const [items, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: TICKET_INCLUDE,
      orderBy: SORTS[filters.sort],
      skip: (filters.page - 1) * filters.perPage,
      take: filters.perPage,
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    items,
    total,
    page: filters.page,
    perPage: filters.perPage,
    pageCount: Math.max(1, Math.ceil(total / filters.perPage)),
  };
}

export async function countByStatus(actor: Actor, extra?: Prisma.TicketWhereInput) {
  const grouped = await prisma.ticket.groupBy({
    by: ['status'],
    where: { AND: [ticketScopeWhere(actor), ...(extra ? [extra] : [])] },
    _count: { _all: true },
  });
  const out: Partial<Record<TicketStatus, number>> = {};
  for (const row of grouped) out[row.status] = row._count._all;
  return out;
}

export async function ensureNotArchived(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { archivedAt: true },
  });
  if (ticket?.archivedAt) throw new ConflictError('This ticket has been archived');
}
