import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TYPES,
  BLOCKED_TYPES,
  extensionOf,
  validateUpload,
} from '@/server/attachments/validation';
import { ValidationError } from '@/lib/errors';
import { newStorageKey } from '@/server/attachments/storage';
import { signAttachment, verifyAttachmentSignature } from '@/server/attachments/signing';

/** docs/SECURITY_MODEL.md T7 — upload validation and signed download URLs. */

const limits = { maxBytes: 25 * 1024 * 1024, maxPerTicket: 10, existingCount: 0 };
const PNG_HEAD = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

/** Returns the reporter-facing field message, which is what the form actually shows. */
function rejectionMessage(run: () => void): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    const fieldErrors = (error as ValidationError).details?.fieldErrors as Record<string, string[]>;
    return fieldErrors.file?.[0] ?? (error as Error).message;
  }
  throw new Error('expected the upload to be rejected, but it was accepted');
}

describe('upload validation', () => {
  it('accepts an allowed type with a matching extension', () => {
    expect(() =>
      validateUpload(
        { filename: 'screenshot.png', mimeType: 'image/png', sizeBytes: 2048, head: PNG_HEAD },
        limits,
      ),
    ).not.toThrow();
  });

  it.each(BLOCKED_TYPES)('rejects the actively dangerous type %s', (mimeType) => {
    expect(() =>
      validateUpload({ filename: 'payload.svg', mimeType, sizeBytes: 100 }, limits),
    ).toThrow(/security|Unsupported/i);
  });

  it('rejects an unknown type', () => {
    expect(() =>
      validateUpload(
        { filename: 'thing.exe', mimeType: 'application/x-dosexec', sizeBytes: 100 },
        limits,
      ),
    ).toThrow(/unsupported/i);
  });

  it('rejects an extension that disagrees with the content type', () => {
    const message = rejectionMessage(() =>
      validateUpload(
        { filename: 'shell.php', mimeType: 'image/png', sizeBytes: 100, head: PNG_HEAD },
        limits,
      ),
    );
    expect(message).toMatch(/extension/i);
  });

  it('rejects content whose magic bytes do not match the claimed type', () => {
    const notPng = Buffer.from('<?php system($_GET[0]); ?>                 ');
    const message = rejectionMessage(() =>
      validateUpload(
        { filename: 'fake.png', mimeType: 'image/png', sizeBytes: 100, head: notPng },
        limits,
      ),
    );
    expect(message).toMatch(/do not match/i);
  });

  it('rejects an oversized file', () => {
    const message = rejectionMessage(() =>
      validateUpload(
        { filename: 'huge.pdf', mimeType: 'application/pdf', sizeBytes: 30 * 1024 * 1024 },
        limits,
      ),
    );
    expect(message).toMatch(/larger than the 25 MB limit/i);
  });

  it('rejects an empty file', () => {
    expect(
      rejectionMessage(() =>
        validateUpload({ filename: 'empty.png', mimeType: 'image/png', sizeBytes: 0 }, limits),
      ),
    ).toMatch(/empty/i);
  });

  it('enforces the per-ticket attachment cap', () => {
    const message = rejectionMessage(() =>
      validateUpload(
        { filename: 'one-more.png', mimeType: 'image/png', sizeBytes: 100, head: PNG_HEAD },
        { ...limits, existingCount: 10 },
      ),
    );
    expect(message).toMatch(/maximum of 10 attachments/i);
  });

  it('covers the formats the brief asks for', () => {
    for (const mime of ['image/png', 'image/jpeg', 'application/pdf', 'text/plain', 'video/mp4']) {
      expect(ALLOWED_TYPES[mime]).toBeDefined();
    }
  });

  it('extracts extensions case-insensitively', () => {
    expect(extensionOf('Report.PDF')).toBe('pdf');
    expect(extensionOf('no-extension')).toBe('');
  });
});

describe('storage keys', () => {
  it('never contains the uploader filename', () => {
    const key = newStorageKey('ticket-1', 'png');
    expect(key).not.toContain('screenshot');
    expect(key).toMatch(/^tickets\/\d{4}\/\d{2}\/ticket-1\/[0-9a-f]{32}\.png$/);
  });

  it('is unique per call', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newStorageKey('t', 'png')));
    expect(keys.size).toBe(50);
  });

  it('falls back to a safe extension for anything odd', () => {
    expect(newStorageKey('t', '../../etc/passwd')).toMatch(/\.bin$/);
  });
});

describe('signed download URLs', () => {
  const id = 'attachment-1';

  it('accepts a signature it produced', () => {
    const expires = Math.floor(Date.now() / 1000) + 300;
    expect(verifyAttachmentSignature(id, String(expires), signAttachment(id, expires))).toBe(true);
  });

  it('rejects an expired signature', () => {
    const expires = Math.floor(Date.now() / 1000) - 10;
    expect(verifyAttachmentSignature(id, String(expires), signAttachment(id, expires))).toBe(false);
  });

  it('rejects a signature minted for a different attachment', () => {
    const expires = Math.floor(Date.now() / 1000) + 300;
    expect(
      verifyAttachmentSignature('attachment-2', String(expires), signAttachment(id, expires)),
    ).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const expires = Math.floor(Date.now() / 1000) + 300;
    const signature = signAttachment(id, expires);
    expect(verifyAttachmentSignature(id, String(expires), `${signature.slice(0, -1)}X`)).toBe(
      false,
    );
  });

  it('rejects a missing signature or expiry', () => {
    expect(verifyAttachmentSignature(id, null, 'x')).toBe(false);
    expect(verifyAttachmentSignature(id, '123', null)).toBe(false);
  });
});
