import type { Engine } from '../../engine';
import { api, ApiError } from '../../io/api';
import { fillPlaceholders, syncTemplates, usableTemplates, USE_CASES } from '../../io/prompt-templates';
import { el, setHidden, setText } from '../dom';
import { PromptHistory } from './prompt-history';

/** The area a prompt is for as a small JPEG data address: the selection's box when `selection` and one is made, else the
 *  whole picture; empty with no document. At most 512 pixels on a side. */
export function areaView(engine: Engine, selection: boolean): () => Promise<string> {
  return async () => {
    const p = engine.current, flat = engine.flattened();
    if (!p || !flat) return '';
    const sel = selection ? p.selection : null, sx = sel ? sel.x : 0, sy = sel ? sel.y : 0, sw = sel ? sel.w : p.doc.width, sh = sel ? sel.h : p.doc.height;
    const k = Math.min(1, 512 / Math.max(sw, sh)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
    const g = c.getContext('2d');
    if (!g) return '';
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(flat as CanvasImageSource, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  };
}

/** The chosen reference pictures, in the order the chips name them, as small JPEG data addresses (512 pixels on a side at
 *  most) with their @img tokens; a picture that cannot be read is left out and the rest keep their numbers. */
export function referenceViews(ordered: () => Promise<Array<{ name: string; blob: Blob }>>): () => Promise<Array<{ token: string; picture: string }>> {
  return async () => {
    const out: Array<{ token: string; picture: string }> = [];
    const list = await ordered();
    for (let i = 0; i < list.length; i++) {
      try {
        const bmp = await createImageBitmap(list[i].blob), k = Math.min(1, 512 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
        const g = c.getContext('2d');
        if (g) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); out.push({ token: `@img${i + 1}`, picture: c.toDataURL('image/jpeg', 0.8) }); }
        bmp.close();
      } catch { /* this reference is not shown to the model */ }
    }
    return out;
  };
}

/** Improve Prompt (1.51.5): a template, Improve and Restore beside a prompt, rewriting it through the language model
 *  set in Preferences > Plugins; Restore puts the original back. */
export class PromptImprover {
  readonly el = el('<div class="cv-improve"></div>');
  private readonly template = el<HTMLSelectElement>('<select class="cv-input" aria-label="Prompt template"></select>');
  private readonly useCase = el<HTMLSelectElement>(`<select class="cv-input" aria-label="Prompt use" title="What the prompt is for: picks the starter template and tells the model">${['<option value="">Any use</option>', ...USE_CASES.map((u) => `<option value="${u.id}">${u.label}</option>`)].join('')}</select>`);
  private readonly go = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Improve</button>');
  private readonly undo = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" hidden>Restore</button>');
  private readonly note = el('<span class="cv-note cv-improve-note" role="status"></span>');
  private readonly stepBack = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Undo the last change to the prompt (Ctrl+Z)" aria-label="Undo prompt" disabled>Undo</button>');
  private readonly stepOn = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Redo (Ctrl+Shift+Z)" aria-label="Redo prompt" disabled>Redo</button>');
  private original: string | null = null;
  /** The area the prompt is for as a data address, sent when the language model row reads pictures; empty when none. */
  view: (() => Promise<string>) | null = null;
  /** The reference pictures the prompt names, each with its @img token, as small data addresses; sent when the row reads pictures. */
  refs: (() => Promise<Array<{ token: string; picture: string }>>) | null = null;
  /** The field's own undo stack: typing, Improve, Restore and prompts set from outside. */
  readonly history: PromptHistory;

  constructor(private readonly field: HTMLInputElement | HTMLTextAreaElement, preferred = 'Richer detail') {
    this.history = new PromptHistory(field);
    this.history.onChange = () => { const u = !this.history.canUndo, r = !this.history.canRedo; if (this.stepBack.disabled !== u) this.stepBack.disabled = u; if (this.stepOn.disabled !== r) this.stepOn.disabled = r; };
    this.stepBack.addEventListener('click', () => { this.history.undo(); this.field.focus(); });
    this.stepOn.addEventListener('click', () => { this.history.redo(); this.field.focus(); });
    this.field.addEventListener('input', () => this.history.onChange());
    this.el.append(this.useCase, this.template, this.go, this.undo, this.stepBack, this.stepOn, this.note);
    this.useCase.addEventListener('change', () => {
      const u = USE_CASES.find((x) => x.id === this.useCase.value);
      if (u && [...this.template.options].some((o) => o.value === u.template)) this.template.value = u.template;
    });
    this.go.addEventListener('click', () => void this.improve());
    (this.field as HTMLElement).addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'u') { e.preventDefault(); if (!this.go.disabled) void this.improve(); } });
    this.go.title = 'Rewrite the prompt with the language model in Preferences (Ctrl+U in the prompt)';
    this.undo.addEventListener('click', () => { if (this.original !== null) { this.history.set(this.original); this.original = null; setHidden(this.undo, true); setText(this.note, 'Restored.'); } });
    this.field.addEventListener('input', () => { this.original = null; setHidden(this.undo, true); });
    this.refresh(preferred);
    void syncTemplates().then(() => this.refresh(this.template.value || preferred));
  }

  /** The templates, the preferred one chosen. */
  refresh(preferred?: string): void {
    const was = preferred ?? this.template.value;
    const names = usableTemplates().map((t) => t.name);
    if (names.length === this.template.options.length && names.every((n, i) => this.template.options[i].value === n)) { if (names.includes(was)) this.template.value = was; return; }
    this.template.replaceChildren(...usableTemplates().map((t) => { const o = document.createElement('option'); o.value = t.name; o.textContent = t.name; return o; }));
    if ([...this.template.options].some((o) => o.value === was)) this.template.value = was;
    this.original = null; setHidden(this.undo, true); setText(this.note, '');
  }

  private async improve(): Promise<void> {
    const prompt = this.field.value.trim();
    if (!prompt) { setText(this.note, 'Write a prompt to improve first.'); return; }
    const t = usableTemplates().find((x) => x.name === this.template.value);
    this.go.disabled = true;
    setText(this.note, 'Improving...');
    try {
      const picture = this.view ? await this.view().catch(() => '') : '';
      const named = this.refs ? await this.refs().catch(() => []) : [];
      const u = USE_CASES.find((x) => x.id === this.useCase.value);
      const better = await api.improvePrompt(prompt, `${fillPlaceholders(t?.text ?? '', { prompt })}${u ? `\n\nThe prompt is for ${u.purpose}.` : ''}`, picture, named);
      this.original = this.field.value;
      this.history.set(better.prompt);
      setHidden(this.undo, false);
      const looked = [better.seen ? 'the area' : '', better.shown.length ? better.shown.join(', ') : ''].filter(Boolean).join(' and ');
      setText(this.note, `Improved${looked ? ` with a look at ${looked}` : ''}${better.restored.length ? `; put back ${better.restored.join(', ')}` : ''}${better.dropped.length ? `. No longer in it: ${better.dropped.join(', ')}` : ''}${better.added.length ? `. New in it: ${better.added.join(', ')}` : ''}.`);
    } catch (err) {
      setText(this.note, err instanceof ApiError ? err.message : 'The formvis engine is offline (./formvis boot).');
    } finally { this.go.disabled = false; }
  }
}
