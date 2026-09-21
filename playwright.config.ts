import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/support_stream_e2e?schema=public';

/**
 * Use a preinstalled Chromium when the environment provides one whose build does not match
 * this Playwright version (CI installs its own, so this is a no-op there).
 */
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(PREINSTALLED_CHROMIUM)
  ? { executablePath: PREINSTALLED_CHROMIUM }
  : {};

/** docs/TEST_STRATEGY.md §4 — the critical flows and the security negatives, through the UI. */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], launchOptions },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL,
      APP_URL: BASE_URL,
      NODE_ENV: 'production',
      SESSION_SECRET: 'e2e-session-secret-at-least-32-characters-long',
      ATTACHMENT_SECRET: 'e2e-attachment-secret-at-least-32-characters',
      JOB_RUNNER_SECRET: 'e2e-job-runner-secret',
      MAIL_DRIVER: 'console',
      CAPTCHA_PROVIDER: 'none',
      STORAGE_LOCAL_PATH: './storage-e2e',
      GUEST_SUBMISSIONS_PER_HOUR: '50',
    },
  },
});
