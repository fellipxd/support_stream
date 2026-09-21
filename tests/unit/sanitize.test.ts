import { describe, expect, it } from 'vitest';
import { escapeHtml, renderMarkdown, toPlainText } from '@/lib/markdown';

/** docs/SECURITY_MODEL.md T8 — no path from user input to executable markup. */
describe('markdown renderer', () => {
  const XSS_PAYLOADS = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg/onload=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<a href="javascript:alert(1)">click</a>',
    '[click](javascript:alert(1))',
    '[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    '<body onload=alert(1)>',
    '"><script>alert(1)</script>',
    '<style>body{display:none}</style>',
    '<object data="x"></object>',
  ];

  /** Tags the renderer is allowed to emit. Anything else in the output is a failure. */
  const ALLOWED_TAGS = [
    'p',
    'ul',
    'li',
    'code',
    'pre',
    'strong',
    'em',
    'a',
    'span',
    'h3',
    'h4',
    'h5',
  ];

  function liveTags(html: string): string[] {
    return [...html.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => (m[1] ?? '').toLowerCase());
  }

  it.each(XSS_PAYLOADS)('neutralises %s', (payload) => {
    const html = renderMarkdown(payload);
    // The payload may survive as *text* (escaped); what must never happen is a live tag or
    // attribute. Checking the emitted tag set proves the escaping rather than assuming it.
    for (const tag of liveTags(html)) {
      expect(ALLOWED_TAGS, `unexpected <${tag}> in output`).toContain(tag);
    }
    expect(html).not.toMatch(/<[a-z][^>]*\son\w+\s*=/i); // no handler on a live tag
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toMatch(/href="data:/i);
    expect(html).not.toMatch(/<script|<iframe|<svg|<style|<object/i);
  });

  it('keeps legitimate formatting', () => {
    const html = renderMarkdown('**bold** and *italic* and `code`');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
  });

  it('renders lists', () => {
    const html = renderMarkdown('- one\n- two');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<li>two</li>');
  });

  it('renders fenced code without interpreting it', () => {
    const html = renderMarkdown('```\n<script>alert(1)</script>\n```');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/<script>/);
  });

  it('allows safe links and hardens them', () => {
    const html = renderMarkdown('[docs](https://example.com/page)');
    expect(html).toContain('href="https://example.com/page"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('drops the link but keeps the label for an unsafe scheme', () => {
    expect(renderMarkdown('[click](javascript:alert(1))')).toContain('click');
  });

  it('linkifies bare URLs', () => {
    expect(renderMarkdown('see https://example.com now')).toContain(
      '<a href="https://example.com"',
    );
  });

  it('marks up mentions without creating markup', () => {
    expect(renderMarkdown('cc @jane.doe')).toContain('<span class="mention">@jane.doe</span>');
  });

  it('never emits headings above h3, so the page outline stays intact', () => {
    const html = renderMarkdown('# one\n## two\n### three');
    expect(html).toContain('<h3>one</h3>');
    expect(html).toContain('<h4>two</h4>');
    expect(html).toContain('<h5>three</h5>');
    expect(html).not.toContain('<h1>');
  });

  it('escapes the five dangerous characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});

describe('plain-text extraction', () => {
  it('strips markup for previews and email bodies', () => {
    expect(toPlainText('**bold** [link](https://e.com) `code`')).toBe('bold link code');
  });

  it('truncates with an ellipsis', () => {
    expect(toPlainText('x'.repeat(300), 50)).toHaveLength(50);
  });

  it('removes fenced code blocks entirely', () => {
    expect(toPlainText('before\n```\nsecret\n```\nafter')).toBe('before after');
  });
});
