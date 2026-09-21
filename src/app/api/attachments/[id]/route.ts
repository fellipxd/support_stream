import { NextResponse, type NextRequest } from 'next/server';
import { getActor } from '@/server/auth/session';
import { getDownloadableAttachment } from '@/server/attachments/service';
import { verifyAttachmentSignature } from '@/server/attachments/signing';
import { isAppError } from '@/lib/errors';

/**
 * Attachment download. Three independent gates (docs/SECURITY_MODEL.md T7):
 *   1. a valid, unexpired signature,
 *   2. an authenticated actor,
 *   3. a policy check that the actor may read this attachment on this ticket.
 * The file is served as an attachment with sniffing disabled, so nothing renders in-page.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);

  if (
    !verifyAttachmentSignature(
      id,
      url.searchParams.get('expires'),
      url.searchParams.get('signature'),
    )
  ) {
    return new NextResponse('Not found', { status: 404 });
  }

  const actor = await getActor();
  if (!actor) return new NextResponse('Not found', { status: 404 });

  try {
    const { attachment, data } = await getDownloadableAttachment(actor, id);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': String(attachment.sizeBytes),
        'Content-Disposition': `attachment; filename="${attachment.filename.replace(/["\\]/g, '')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const status = isAppError(error) ? error.httpStatus : 500;
    return new NextResponse(status === 500 ? 'Server error' : 'Not found', {
      status: status === 403 ? 403 : 404,
    });
  }
}
