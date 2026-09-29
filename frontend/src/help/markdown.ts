/** The manual's Markdown, as DOM (1.52.3): headings, lists (continuation lines indented), paragraphs, `code` and
 *  **bold**. Built with elements and text nodes only, never innerHTML, so nothing in the text can become markup. */
export interface Section { title: string; body: string }

export function sections(md: string): Section[] {
  const parts = md.split(/\n(?=## )/);
  return parts.slice(1).map((p) => { const nl = p.indexOf('\n'); return { title: p.slice(3, nl < 0 ? undefined : nl).trim(), body: nl < 0 ? '' : p.slice(nl + 1).trim() }; });
}

function inline(parent: HTMLElement, text: string): void {
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let at = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > at) parent.append(document.createTextNode(text.slice(at, m.index)));
    const e = document.createElement(m[1] !== undefined ? 'code' : 'strong');
    e.textContent = m[1] ?? m[2];
    parent.append(e);
    at = m.index + m[0].length;
  }
  if (at < text.length) parent.append(document.createTextNode(text.slice(at)));
}

export function render(body: string): DocumentFragment {
  const out = document.createDocumentFragment();
  let list: HTMLUListElement | null = null, item: string | null = null, para: string[] = [];
  const flushItem = (): void => { if (item !== null && list) { const li = document.createElement('li'); inline(li, item); list.append(li); } item = null; };
  const flushList = (): void => { flushItem(); if (list) out.append(list); list = null; };
  const flushPara = (): void => { if (para.length) { const p = document.createElement('p'); inline(p, para.join(' ')); out.append(p); } para = []; };
  for (const raw of body.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('- ')) { flushPara(); if (!list) list = document.createElement('ul'); flushItem(); item = line.slice(2); }
    else if (item !== null && line.startsWith('  ') && line.trim()) item += ' ' + line.trim();
    else if (!line.trim()) { flushList(); flushPara(); }
    else if (line.startsWith('# ')) { flushList(); flushPara(); const h = document.createElement('h2'); inline(h, line.slice(2)); out.append(h); }
    else { flushList(); para.push(line.trim()); }
  }
  flushList(); flushPara();
  return out;
}

/** The sections most about `question`: its words (three letters or more, common words left out) counted in each. */
export function relevant(all: Section[], question: string, n = 3): Section[] {
  const common = new Set(['the', 'and', 'how', 'can', 'does', 'what', 'where', 'with', 'for', 'you', 'this', 'that', 'into', 'from', 'are', 'there', 'formvis']);
  const words = question.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((w) => !common.has(w)) ?? [];
  const score = (s: Section): number => { const t = `${s.title} ${s.title} ${s.body}`.toLowerCase(); return words.reduce((n2, w) => n2 + (t.split(w).length - 1), 0); };
  return all.map((s) => ({ s, k: score(s) })).filter((x) => x.k > 0).sort((a, b) => b.k - a.k).slice(0, n).map((x) => x.s);
}
