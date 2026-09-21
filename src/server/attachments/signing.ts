import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from '../config/env';

/**
 * Short-lived signed download URLs (docs/SECURITY_MODEL.md T7). The signature binds the
 * attachment id to an expiry; the download route still performs a full authorisation check —
 * the signature is defence in depth, not the access control itself.
 */
const TTL_SECONDS = 300;

export function signAttachment(attachmentId: string, expiresAt: number): string {
  return createHmac('sha256', getEnv().ATTACHMENT_SECRET)
    .update(`${attachmentId}.${expiresAt}`)
    .digest('base64url');
}

export function attachmentUrl(attachmentId: string, ttlSeconds = TTL_SECONDS): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = signAttachment(attachmentId, expires);
  return `/api/attachments/${attachmentId}?expires=${expires}&signature=${signature}`;
}

export function verifyAttachmentSignature(
  attachmentId: string,
  expires: string | null,
  signature: string | null,
): boolean {
  if (!expires || !signature) return false;
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signAttachment(attachmentId, expiresAt));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
