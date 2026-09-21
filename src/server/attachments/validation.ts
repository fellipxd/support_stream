import { ValidationError } from '@/lib/errors';

/**
 * Upload validation (docs/SECURITY_MODEL.md T7). Allow-list of MIME types *and* extensions,
 * plus a magic-byte check, so a renamed executable or an HTML/SVG payload cannot enter the
 * system by claiming a friendly content type.
 */
export const ALLOWED_TYPES: Record<string, string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
  'text/plain': ['txt', 'log'],
  'text/csv': ['csv'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
  'video/quicktime': ['mov'],
};

/** Explicitly rejected regardless of anything else: active content in the browser. */
export const BLOCKED_TYPES = [
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'application/javascript',
  'text/javascript',
  'application/x-msdownload',
  'application/x-sh',
];

export function extensionOf(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? (parts.pop() ?? '') : '';
}

const MAGIC: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  {
    mime: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', test: (b) => b.subarray(0, 3).toString('ascii') === 'GIF' },
  {
    mime: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  { mime: 'application/pdf', test: (b) => b.subarray(0, 4).toString('ascii') === '%PDF' },
];

export type UploadCandidate = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  head?: Buffer;
};

export type Limits = { maxBytes: number; maxPerTicket: number; existingCount: number };

export function validateUpload(file: UploadCandidate, limits: Limits): void {
  const fieldErrors: Record<string, string[]> = {};

  if (BLOCKED_TYPES.includes(file.mimeType)) {
    fieldErrors.file = [`${file.filename}: this file type is not accepted for security reasons`];
    throw new ValidationError('Unsupported file type', { fieldErrors });
  }

  const allowedExts = ALLOWED_TYPES[file.mimeType];
  if (!allowedExts) {
    fieldErrors.file = [`${file.filename}: unsupported file type (${file.mimeType})`];
    throw new ValidationError('Unsupported file type', { fieldErrors });
  }

  const ext = extensionOf(file.filename);
  if (!allowedExts.includes(ext)) {
    fieldErrors.file = [`${file.filename}: the file extension does not match its content type`];
    throw new ValidationError('Unsupported file type', { fieldErrors });
  }

  if (file.sizeBytes <= 0) {
    fieldErrors.file = [`${file.filename}: the file is empty`];
    throw new ValidationError('Empty file', { fieldErrors });
  }

  if (file.sizeBytes > limits.maxBytes) {
    const mb = Math.round(limits.maxBytes / (1024 * 1024));
    fieldErrors.file = [`${file.filename}: file is larger than the ${mb} MB limit`];
    throw new ValidationError('File too large', { fieldErrors });
  }

  if (limits.existingCount >= limits.maxPerTicket) {
    fieldErrors.file = [
      `This ticket already has the maximum of ${limits.maxPerTicket} attachments`,
    ];
    throw new ValidationError('Too many attachments', { fieldErrors });
  }

  // Magic-byte check for the formats where it is meaningful.
  if (file.head && file.head.length >= 12) {
    const expected = MAGIC.find((m) => m.mime === file.mimeType);
    if (expected && !expected.test(file.head)) {
      fieldErrors.file = [
        `${file.filename}: the file contents do not match a ${file.mimeType} file`,
      ];
      throw new ValidationError('File content does not match its type', { fieldErrors });
    }
  }
}

export function acceptAttribute(): string {
  return Object.values(ALLOWED_TYPES)
    .flat()
    .map((e) => `.${e}`)
    .join(',');
}
