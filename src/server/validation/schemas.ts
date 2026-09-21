import { z } from 'zod';

/** Shared validation contracts. Server actions and route handlers use the same schemas. */

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(320);

export const reportIssueSchema = z.object({
  // Reporter (ignored for authenticated users — their identity comes from the session)
  reporterName: trimmed(2, 120).optional(),
  reporterEmail: emailSchema.optional(),
  reporterPhone: z.string().trim().max(40).optional().or(z.literal('')),
  reporterOrganization: z.string().trim().max(160).optional().or(z.literal('')),

  // Issue
  portalId: z.string().uuid('Select the portal you were using'),
  categoryId: z.string().uuid('Select a category').optional().or(z.literal('')),
  title: trimmed(5, 160),
  description: trimmed(10, 10_000),
  whatTrying: z.string().trim().max(2000).optional().or(z.literal('')),
  whatHappened: z.string().trim().max(2000).optional().or(z.literal('')),
  whatExpected: z.string().trim().max(2000).optional().or(z.literal('')),
  // An unselected <select> submits an empty string, which must mean "not answered".
  frequency: z
    .union([z.enum(['ALWAYS', 'SOMETIMES', 'ONCE']), z.literal('')])
    .optional()
    .transform((v) => v || undefined),
  occurredAt: z.string().optional().or(z.literal('')),

  // Environment (captured automatically, still validated)
  browser: z.string().trim().max(200).optional().or(z.literal('')),
  os: z.string().trim().max(120).optional().or(z.literal('')),
  device: z.string().trim().max(120).optional().or(z.literal('')),
  pageUrl: z.string().trim().max(2000).optional().or(z.literal('')),

  captchaToken: z.string().optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export type ReportIssueInput = z.infer<typeof reportIssueSchema>;

export const commentSchema = z.object({
  ticketId: z.string().uuid(),
  body: trimmed(1, 10_000),
  visibility: z.enum(['PUBLIC', 'INTERNAL', 'QA_NOTE', 'DEV_NOTE']).default('PUBLIC'),
});

export const triageSchema = z.object({
  ticketId: z.string().uuid(),
  portalId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional().or(z.literal('')),
  severity: z.enum(['S1_CRITICAL', 'S2_HIGH', 'S3_MEDIUM', 'S4_LOW']),
  priority: z.enum(['P0_EMERGENCY', 'P1_URGENT', 'P2_NORMAL', 'P3_LOW']),
  projectId: z.string().uuid().optional().or(z.literal('')),
});

export const assignmentSchema = z.object({
  ticketId: z.string().uuid(),
  role: z.enum(['SUPPORT', 'QA', 'ENGINEERING']),
  assigneeId: z.string().uuid().optional().or(z.literal('')),
});

export const transitionSchema = z.object({
  ticketId: z.string().uuid(),
  to: z.enum([
    'NEW',
    'TRIAGE',
    'ASSIGNED',
    'IN_PROGRESS',
    'WAITING_FOR_USER',
    'WAITING_FOR_DEVELOPER',
    'READY_FOR_QA',
    'QA_VERIFICATION',
    'RESOLVED',
    'CLOSED',
    'REOPENED',
    'DUPLICATE',
    'REJECTED',
    'CANCELLED',
  ]),
  note: z.string().trim().max(4000).optional().or(z.literal('')),
  duplicateOfKey: z.string().trim().max(24).optional().or(z.literal('')),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(200),
});

export const registerSchema = z
  .object({
    name: trimmed(2, 120),
    email: emailSchema,
    password: z
      .string()
      .min(12, 'Use at least 12 characters')
      .max(200)
      .refine(
        (v) => /[a-z]/i.test(v) && /\d/.test(v),
        'Include at least one letter and one number',
      ),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const ticketFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.string().optional(),
  portalId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  severity: z.string().optional(),
  priority: z.string().optional(),
  assigneeId: z.string().optional(),
  slaState: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(10).max(100).default(25),
  sort: z.enum(['newest', 'oldest', 'priority', 'updated']).default('newest'),
});

export type TicketFilterInput = z.infer<typeof ticketFilterSchema>;

export const portalSchema = z.object({
  id: z.string().uuid().optional(),
  name: trimmed(2, 120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens'),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  url: z.string().trim().url().max(500).optional().or(z.literal('')),
  isActive: z.coerce.boolean().default(true),
});

export const categorySchema = z.object({
  id: z.string().uuid().optional(),
  portalId: z.string().uuid(),
  name: trimmed(2, 120),
  isActive: z.coerce.boolean().default(true),
});

/** Turns a ZodError into the field-error shape used by forms. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
