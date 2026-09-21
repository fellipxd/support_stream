/**
 * Minimal, allow-list Markdown renderer (docs/SECURITY_MODEL.md T8).
 *
 * Deliberately not a general Markdown engine: user content is escaped first and only a fixed
 * set of constructs is then re-introduced, so there is no path by which user input reaches the
 * DOM as markup. No raw HTML, no javascript:/data: URLs, no event handlers.
 */
const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ESCAPE[c] ?? c);
}

function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:[^\s<>"']+@[^\s<>"']+$/i.test(trimmed)) return trimmed;
  return null;
}

function inline(text: string): string {
  let out = escapeHtml(text);
  // `code`
  out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // [label](url) — only http(s)/mailto survive
  out = out.replace(
    /\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)/g,
    (match, label: string, url: string) => {
      const href = safeUrl(url.replace(/&amp;/g, '&'));
      if (!href) return label;
      return `<a href="${escapeHtml(href)}" rel="noopener noreferrer nofollow" target="_blank">${label}</a>`;
    },
  );
  // bold / italic
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // bare URLs
  out = out.replace(/(^|\s)(https?:\/\/[^\s<]{4,2000})/g, (m, pre: string, url: string) => {
    const href = safeUrl(url.replace(/&amp;/g, '&'));
    return href
      ? `${pre}<a href="${escapeHtml(href)}" rel="noopener noreferrer nofollow" target="_blank">${escapeHtml(href)}</a>`
      : m;
  });
  // @mentions
  out = out.replace(/(^|\s)@([a-z0-9._-]{2,64})/gi, '$1<span class="mention">@$2</span>');
  return out;
}

/** Renders a safe HTML fragment. The output contains no user-controlled markup. */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inList = false;
  let inCode = false;
  const codeBuffer: string[] = [];

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
        codeBuffer.length = 0;
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }
    const listMatch = /^\s*[-*]\s+(.*)$/.exec(line);
    if (listMatch) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inline(listMatch[1] ?? '')}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === '') continue;
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1]?.length ?? 1, 3) + 2; // h3..h5, page owns h1/h2
      html.push(`<h${level}>${inline(heading[2] ?? '')}</h${level}>`);
      continue;
    }
    html.push(`<p>${inline(line)}</p>`);
  }
  if (inCode && codeBuffer.length) {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }
  closeList();
  return html.join('\n');
}

/** Plain-text preview for lists and email subjects. */
export function toPlainText(source: string, max = 200): string {
  const text = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`>_-]/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
