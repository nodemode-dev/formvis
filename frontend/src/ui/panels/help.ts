import MANUAL from '../../../../docs/MANUAL.md?raw';
import { api, ApiError } from '../../io/api';
import { relevant, render, sections, type Section } from '../../help/markdown';
import { Dialog } from '../dialogs';
import { el, setHidden, setText } from '../dom';

/** Help > formvis Help (F1, 1.52.3): the manual, with its contents, a search, and Ask: the sections most about a
 *  question go to the language model set in Preferences > Plugins, which answers from them alone. */
export class HelpDialog extends Dialog {
  private readonly all: Section[] = sections(MANUAL);
  private readonly search = el<HTMLInputElement>('<input class="cv-input" type="search" aria-label="Search the manual" placeholder="Search the manual">');
  private readonly nav = el('<nav class="cv-help-nav" aria-label="Contents"></nav>');
  private readonly page = el('<div class="cv-help-page"></div>');
  private readonly question = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="Ask the manual" placeholder="Ask the manual, e.g. how do I send the selection to ComfyUI?">');
  private readonly answer = el('<div class="cv-help-answer" role="status"></div>');
  private readonly items: Array<{ s: Section; nav: HTMLButtonElement; box: HTMLElement }> = [];
  private readonly turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private said = '';

  constructor() {
    super('formvis Help', 780);
    for (const s of this.all) {
      const box = el('<section class="cv-help-section"></section>'), h = document.createElement('h2');
      h.textContent = s.title; box.append(h, render(s.body));
      const b = el<HTMLButtonElement>('<button type="button" class="cv-help-link"></button>');
      b.textContent = s.title;
      b.addEventListener('click', () => box.scrollIntoView({ block: 'start' }));
      this.nav.append(b); this.page.append(box);
      this.items.push({ s, nav: b, box });
    }
    this.search.addEventListener('input', () => this.filter());
    const go = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Ask</button>');
    go.addEventListener('click', () => void this.ask());
    const clear = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Forget the questions so far and start a new chat">New chat</button>');
    clear.addEventListener('click', () => { this.turns.length = 0; this.said = ''; setText(this.answer, ''); this.question.focus(); });
    this.question.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void this.ask(); } e.stopPropagation(); });
    const askRow = el('<div class="cv-improve"></div>'); askRow.append(this.question, go, clear);
    const body = el('<div class="cv-help"></div>'), side = el('<div class="cv-help-side"></div>');
    side.append(this.search, this.nav);
    body.append(side, this.page);
    this.body.append(askRow, this.answer, body);
    this.button('Close', 'ghost', () => this.close());
  }

  show(): void { this.open(); this.search.focus(); }

  private filter(): void {
    const q = this.search.value.trim().toLowerCase();
    for (const it of this.items) { const on = !q || `${it.s.title}\n${it.s.body}`.toLowerCase().includes(q); setHidden(it.box, !on); setHidden(it.nav, !on); }
  }

  private async ask(): Promise<void> {
    const q = this.question.value.trim();
    if (!q) return;
    const lastAsked = [...this.turns].reverse().find((x) => x.role === 'user')?.content ?? '';
    const found = relevant(this.all, q).length ? relevant(this.all, q) : relevant(this.all, `${lastAsked} ${q}`);   // a follow-up borrows the words of the question before it
    const show = (text: string): void => setText(this.answer, this.said ? `${this.said}\n\n${text}` : text);
    if (!found.length) { show('The manual says nothing about that. Try other words, or search it.'); return; }
    const st = await api.llmStatus();
    if (!st?.configured) { show(`Set a language model in Preferences > Plugins to ask questions. The manual's sections about it: ${found.map((s) => s.title).join(', ')}.`); return; }
    show('Asking...');
    const context = found.map((s) => `## ${s.title}\n${s.body}`).join('\n\n');
    try {
      const r = await api.assistantStep([
        { role: 'system', content: 'Answer questions about formvis, an image editor, from the manual sections below and nothing else. If they do not say, reply that the manual does not cover it. Be short and name the menus and settings exactly.\n\n' + context },
        ...this.turns.slice(-8), { role: 'user', content: q }], false);
      const reply = r.content.trim() || 'No answer came back.';
      this.turns.push({ role: 'user', content: q }, { role: 'assistant', content: reply });
      this.said = `${this.said ? `${this.said}\n\n` : ''}${q}\n${reply}\nFrom: ${found.map((s) => s.title).join(', ')}.`;
      setText(this.answer, this.said);
      this.question.value = '';
    } catch (err) { show(err instanceof ApiError ? err.message : 'The formvis engine is offline (./formvis boot).'); }
  }
}
