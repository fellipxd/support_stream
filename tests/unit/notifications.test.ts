import { describe, expect, it } from 'vitest';
import { renderEmail, TEMPLATE_NAMES, type TemplateData } from '@/server/notifications/templates';
import { commentPreview, reporterTemplateForStatus } from '@/server/notifications/service';

/** docs/NOTIFICATION_ARCHITECTURE.md — templates, and the internal-content invariant. */

const data: TemplateData = {
  recipientName: 'John Doe',
  ticketKey: 'SUP-000251',
  ticketTitle: 'Payment failing for Guardian account',
  status: 'IN_PROGRESS',
  portalName: 'Guardian Portal',
  categoryName: 'Payment',
  severity: 'S2_HIGH',
  priority: 'P1_URGENT',
  ticketUrl: 'https://support.example.com/t/abc123',
};

describe('email templates', () => {
  it.each(TEMPLATE_NAMES)('%s renders a subject, HTML and text body', (template) => {
    const email = renderEmail(template, data);
    expect(email.subject.length).toBeGreaterThan(0);
    expect(email.html).toContain('<!doctype html>');
    expect(email.text.length).toBeGreaterThan(0);
  });

  it.each(TEMPLATE_NAMES)('%s shows the ticket key, title, status and link', (template) => {
    const email = renderEmail(template, data);
    for (const body of [email.html, email.text]) {
      expect(body).toContain('SUP-000251');
      expect(body).toContain('Payment failing for Guardian account');
      expect(body).toContain(data.ticketUrl);
    }
    expect(email.html).toContain('In progress');
  });

  it('puts the ticket key in every subject line', () => {
    for (const template of TEMPLATE_NAMES) {
      expect(renderEmail(template, data).subject).toContain('SUP-000251');
    }
  });

  it('escapes hostile content in a ticket title', () => {
    const email = renderEmail('ticket_received', {
      ...data,
      ticketTitle: '<script>alert(1)</script>',
    });
    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('escapes hostile content in a quoted message', () => {
    const email = renderEmail('new_comment', { ...data, message: '<img src=x onerror=alert(1)>' });
    expect(email.html).not.toMatch(/<img/i);
    expect(email.html).not.toMatch(/<[a-z][^>]*\sonerror\s*=/i);
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('tells a resolved reporter how to confirm or reopen', () => {
    const email = renderEmail('ticket_resolved', { ...data, status: 'RESOLVED' });
    expect(email.text.toLowerCase()).toContain('reopen');
  });

  it('asks clearly for information when one is requested', () => {
    expect(renderEmail('information_requested', data).subject.toLowerCase()).toContain(
      'information',
    );
  });

  it('refuses an unknown template rather than sending something empty', () => {
    // @ts-expect-error deliberately invalid
    expect(() => renderEmail('does_not_exist', data)).toThrow(/Unknown email template/);
  });
});

describe('reporter notification policy', () => {
  it('emails the reporter only for statuses that concern them', () => {
    expect(reporterTemplateForStatus('RESOLVED')).toBe('ticket_resolved');
    expect(reporterTemplateForStatus('CLOSED')).toBe('ticket_closed');
    expect(reporterTemplateForStatus('REOPENED')).toBe('ticket_reopened');
    expect(reporterTemplateForStatus('WAITING_FOR_USER')).toBe('information_requested');
  });

  it('stays silent about internal workflow movement', () => {
    for (const status of [
      'TRIAGE',
      'ASSIGNED',
      'IN_PROGRESS',
      'READY_FOR_QA',
      'QA_VERIFICATION',
      'WAITING_FOR_DEVELOPER',
    ] as const) {
      expect(reporterTemplateForStatus(status)).toBeNull();
    }
  });
});

describe('comment previews', () => {
  it('flattens markdown for safe inclusion in an email', () => {
    expect(commentPreview('**Fix** deployed, see `logs`')).toBe('Fix deployed, see logs');
  });

  it('truncates long bodies', () => {
    expect(commentPreview('x'.repeat(1000)).length).toBeLessThanOrEqual(400);
  });
});
