import { z } from 'zod';

/**
 * Environment validation (docs/SECURITY_MODEL.md §5). The process refuses to boot with a
 * missing secret, or with a development placeholder in production.
 */
const booleanish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  ATTACHMENT_SECRET: z.string().min(32, 'ATTACHMENT_SECRET must be at least 32 characters'),

  MAIL_DRIVER: z.enum(['console', 'smtp']).default('console'),
  MAIL_FROM: z.string().default('Support Portal <support@example.com>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: booleanish,

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage'),

  GUEST_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  GUEST_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24),
  REOPEN_WINDOW_DAYS: z.coerce.number().int().positive().default(14),
  AUTO_CLOSE_DAYS: z.coerce.number().int().positive().default(7),
  MAX_ATTACHMENT_MB: z.coerce.number().int().positive().default(25),
  MAX_ATTACHMENTS_PER_TICKET: z.coerce.number().int().positive().default(10),

  CAPTCHA_PROVIDER: z.enum(['none', 'turnstile']).default('none'),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  GUEST_SUBMISSIONS_PER_HOUR: z.coerce.number().int().positive().default(5),

  JOB_RUNNER_SECRET: z.string().min(8).default('dev-job-runner-secret-change-me'),
});

const DEV_PLACEHOLDERS = ['change-me', 'dev-session-secret', 'dev-attachment-secret'];

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    for (const [key, value] of Object.entries({
      SESSION_SECRET: env.SESSION_SECRET,
      ATTACHMENT_SECRET: env.ATTACHMENT_SECRET,
      JOB_RUNNER_SECRET: env.JOB_RUNNER_SECRET,
    })) {
      if (DEV_PLACEHOLDERS.some((p) => value.includes(p))) {
        throw new Error(`${key} still holds a development placeholder; refusing to start`);
      }
    }
    if (env.MAIL_DRIVER === 'smtp' && !env.SMTP_HOST) {
      throw new Error('SMTP_HOST is required when MAIL_DRIVER=smtp');
    }
  }
  return env;
}

let cached: ReturnType<typeof load> | null = null;

export function getEnv() {
  if (!cached) cached = load();
  return cached;
}

/** Test-only reset so suites can exercise validation failures. */
export function __resetEnvCache() {
  cached = null;
}
