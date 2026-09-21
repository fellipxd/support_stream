import { getEnv } from '../config/env';
import { logger } from '@/lib/logger';

/**
 * CAPTCHA verification behind a provider boundary (docs/SECURITY_MODEL.md T10). `none` is the
 * default so local development and tests are frictionless; production sets `turnstile`.
 */
export async function verifyCaptcha(token: string | undefined, ip?: string): Promise<boolean> {
  const env = getEnv();
  if (env.CAPTCHA_PROVIDER === 'none') return true;
  if (!token) return false;

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    logger.error('captcha.verify_failed', { error: String(error) });
    return false; // fail closed
  }
}
