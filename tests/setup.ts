/**
 * Test bootstrap. Integration tests run against a real Postgres database — a mocked client
 * cannot prove that a transaction rolled back (docs/TEST_STRATEGY.md §7).
 */
// `NODE_ENV` is typed read-only, so it is set through Object.assign rather than a cast.
Object.assign(process.env, { NODE_ENV: 'test' });
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/support_stream_test?schema=public';
process.env.SESSION_SECRET ??= 'test-session-secret-at-least-32-characters-long';
process.env.ATTACHMENT_SECRET ??= 'test-attachment-secret-at-least-32-characters';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.MAIL_DRIVER ??= 'console';
process.env.CAPTCHA_PROVIDER ??= 'none';
process.env.STORAGE_LOCAL_PATH ??= './storage-test';
