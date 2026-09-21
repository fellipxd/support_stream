import 'server-only';
import { getEnv } from '../config/env';
import { logger } from '@/lib/logger';

/** Provider-neutral mail boundary (docs/PRODUCT_REQUIREMENTS.md A5). */
export type OutgoingMail = { to: string; subject: string; html: string; text: string };
export type SendResult = { messageId: string };

export interface Mailer {
  send(mail: OutgoingMail): Promise<SendResult>;
}

/** Development/test driver: logs metadata and records the message for inspection. */
class ConsoleMailer implements Mailer {
  async send(mail: OutgoingMail): Promise<SendResult> {
    const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    logger.info('mail.console', { to: mail.to, subject: mail.subject, messageId });
    return { messageId };
  }
}

class SmtpMailer implements Mailer {
  async send(mail: OutgoingMail): Promise<SendResult> {
    const env = getEnv();
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
    const info = await transport.sendMail({
      from: env.MAIL_FROM,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    return { messageId: info.messageId };
  }
}

let instance: Mailer | null = null;

export function getMailer(): Mailer {
  if (!instance) {
    instance = getEnv().MAIL_DRIVER === 'smtp' ? new SmtpMailer() : new ConsoleMailer();
  }
  return instance;
}

/** Test seam. */
export function setMailer(mailer: Mailer | null) {
  instance = mailer;
}
