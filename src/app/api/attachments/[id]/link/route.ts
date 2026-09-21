import { NextResponse, type NextRequest } from 'next/server';
import { getActor } from '@/server/auth/session';
import { prisma } from '@/server/db/client';
import { can } from '@/server/authz/policy';
import { attachmentUrl } from '@/server/attachments/signing';

/**
 * Mints a short-lived signed URL and redirects to it, so the signature never has to be
 * rendered into a page (where it would sit in the HTML, the history and any cache).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const actor = await getActor();
  if (!actor) return new NextResponse('Not found', { status: 404 });

  const attachment = await prisma.ticketAttachment.findUnique({
    where: { id },
    select: {
      visibility: true,
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
  if (!attachment) return new NextResponse('Not found', { status: 404 });
  if (!can(actor, 'attachment.download', attachment.ticket))
    return new NextResponse('Not found', { status: 404 });
  if (
    attachment.visibility === 'INTERNAL' &&
    !can(actor, 'comment.read.internal', attachment.ticket)
  ) {
    return new NextResponse('Not found', { status: 404 });
  }

  return NextResponse.redirect(new URL(attachmentUrl(id), request.url));
}
