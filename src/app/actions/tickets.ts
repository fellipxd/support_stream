'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { toActionError, ValidationError, type ActionResult } from '@/lib/errors';
import { getActor, requireActor } from '@/server/auth/session';
import { verifyCaptcha } from '@/server/auth/captcha';
import { enforce } from '@/server/auth/rate-limit';
import { issueGuestToken } from '@/server/auth/guest-access';
import { getEnv } from '@/server/config/env';
import { uploadAttachment } from '@/server/attachments/service';
import {
  addComment,
  assignTicket,
  createTicket,
  transitionTicket,
  triageTicket,
} from '@/server/tickets/service';
import {
  assignmentSchema,
  commentSchema,
  fieldErrorsOf,
  reportIssueSchema,
  transitionSchema,
  triageSchema,
} from '@/server/validation/schemas';

/**
 * Server actions: the only entry point for mutations from the UI. Each one re-authenticates,
 * re-validates and delegates to a domain service — no business rule lives here.
 */

async function clientMeta() {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown',
    userAgent: h.get('user-agent') ?? undefined,
  };
}

function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

export type ReportResult = ActionResult<{ key: string; guestToken?: string }>;

export async function reportIssueAction(_prev: unknown, formData: FormData): Promise<ReportResult> {
  try {
    const meta = await clientMeta();
    const actor = await getActor();
    const isAnonymous = actor?.kind !== 'user';

    if (isAnonymous) {
      // Abuse protection applies to anonymous submission only (docs/SECURITY_MODEL.md T10).
      await enforce({
        key: `report:${meta.ip}`,
        limit: getEnv().GUEST_SUBMISSIONS_PER_HOUR,
        windowSeconds: 3600,
      });
    }

    const parsed = reportIssueSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Please check the highlighted fields',
        code: 'VALIDATION_ERROR',
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    if (isAnonymous && !(await verifyCaptcha(parsed.data.captchaToken, meta.ip))) {
      return {
        ok: false,
        error: 'Please complete the verification challenge and try again.',
        code: 'CAPTCHA_FAILED',
      };
    }

    // An anonymous submitter is a brand-new guest, not a session-bound one.
    const submissionActor = actor?.kind === 'user' ? actor : ({ kind: 'system' } as const);
    const created = await createTicket(submissionActor, parsed.data, meta);

    const files = formData
      .getAll('attachments')
      .filter((f): f is File => f instanceof File && f.size > 0);
    for (const file of files) {
      await uploadAttachment({ kind: 'system' }, { ticketId: created.id, file });
    }

    if (actor?.kind === 'user') {
      revalidatePath('/dashboard');
      return { ok: true, data: { key: created.key } };
    }
    // Guests get a one-time link so the confirmation page can hand them into the ticket.
    const token = await issueGuestToken(created.id, meta.ip);
    return { ok: true, data: { key: created.key, guestToken: token } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addCommentAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const parsed = commentSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Please check your comment',
        code: 'VALIDATION_ERROR',
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }
    const comment = await addComment(actor, parsed.data);

    const files = formData
      .getAll('attachments')
      .filter((f): f is File => f instanceof File && f.size > 0);
    for (const file of files) {
      await uploadAttachment(actor, {
        ticketId: parsed.data.ticketId,
        file,
        commentId: comment.id,
        visibility: parsed.data.visibility === 'PUBLIC' ? 'PUBLIC' : 'INTERNAL',
      });
    }

    revalidatePath('/tickets/[key]', 'page');
    return { ok: true, data: { id: comment.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function triageAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const actor = await requireActor();
    const parsed = triageSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Please check the triage details',
        code: 'VALIDATION_ERROR',
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }
    await triageTicket(actor, {
      ticketId: parsed.data.ticketId,
      portalId: parsed.data.portalId,
      categoryId: parsed.data.categoryId || null,
      severity: parsed.data.severity,
      priority: parsed.data.priority,
      projectId: parsed.data.projectId || null,
    });
    revalidatePath('/tickets/[key]', 'page');
    revalidatePath('/queue');
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const actor = await requireActor();
    const parsed = assignmentSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Please choose someone to assign',
        code: 'VALIDATION_ERROR',
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }
    await assignTicket(actor, {
      ticketId: parsed.data.ticketId,
      role: parsed.data.role,
      assigneeId: parsed.data.assigneeId || null,
    });
    revalidatePath('/tickets/[key]', 'page');
    revalidatePath('/queue');
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function transitionAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const actor = await requireActor();
    const parsed = transitionSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'That status change is not available',
        code: 'VALIDATION_ERROR',
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }
    await transitionTicket(actor, {
      ticketId: parsed.data.ticketId,
      to: parsed.data.to,
      note: parsed.data.note || undefined,
      duplicateOfKey: parsed.data.duplicateOfKey || undefined,
    });
    revalidatePath('/tickets/[key]', 'page');
    revalidatePath('/queue');
    revalidatePath('/dashboard');
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Form action: returns nothing so it can be used directly as a `<form action>`. */
export async function markNotificationsReadAction(): Promise<void> {
  const actor = await requireActor();
  if (actor.kind !== 'user') throw new ValidationError('Not available');
  const { prisma } = await import('@/server/db/client');
  await prisma.notification.updateMany({
    where: { userId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath('/notifications');
}

const searchSchema = z.object({ q: z.string().trim().max(200) });

export async function searchRedirectAction(formData: FormData) {
  const parsed = searchSchema.safeParse(formToObject(formData));
  redirect(`/tickets?q=${encodeURIComponent(parsed.success ? parsed.data.q : '')}`);
}
