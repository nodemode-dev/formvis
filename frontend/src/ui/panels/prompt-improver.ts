import { api, ApiError } from '../../io/api';
import { fillPlaceholders, templates } from '../../io/prompt-templates';
import { el, setHidden, setText } from '../dom';
import { PromptHistory } from './prompt-history';

/** Improve Prompt (1.51.5): a template, Improve and Restore beside a prompt, rewriting it through the language model
 *  set in Preferences > Plugins; Restore puts the original back. */
export class PromptImprover {
  readonly el = el('<div class="cv-improve"></div>');
  private readonly template = el<HTMLSelectElement>('<select class="cv-input" aria-label="Prompt template"></select>');
  private readonly go = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Improve</button>');
  private readonly undo = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" hidden>Restore</button>');
  private readonly note = el('<span class="cv-note cv-improve-note" role="status"></span>');
  private readonly stepBack = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Undo the last change to the prompt (Ctrl+Z)" aria-label="Undo prompt" disabled>Undo</button>');
  private readonly stepOn = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Redo (Ctrl+Shift+Z)" aria-label="Redo prompt" disabled>Redo</button>');
  private original: string | null = null;
  /** The field's own undo stack: typing, Improve, Restore and prompts set from outside. */
  readonly history: PromptHistory;

  constructor(private readonly field: HTMLInputElement | HTMLTextAreaElement, preferred = 'Richer detail') {
    this.history = new PromptHistory(field);
    this.history.onChange = () => { const u = !this.history.canUndo, r = !this.history.canRedo; if (this.stepBack.disabled !== u) this.stepBack.disabled = u; if (this.stepOn.disabled !== r) this.stepOn.disabled = r; };
    this.stepBack.addEventListener('click', () => { this.history.undo(); this.field.focus(); });
    this.stepOn.addEventListener('click', () => { this.history.redo(); this.field.focus(); });
    this.field.addEventListener('input', () => this.history.onChange());
    this.el.append(this.template, this.go, this.undo, this.stepBack, this.stepOn, this.note);
    this.go.addEventListener('click', () => void this.improve());
    (this.field as HTMLElement).addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'u') { e.preventDefault(); if (!this.go.disabled) void this.improve(); } });
    this.go.title = 'Rewrite the prompt with the language model in Preferences (Ctrl+U in the prompt)';
    this.undo.addEventListener('click', () => { if (this.original !== null) { this.history.set(this.original); this.original = null; setHidden(this.undo, true); setText(this.note, 'Restored.'); } });
    this.field.addEventListener('input', () => { this.original = null; setHidden(this.undo, true); });
    this.refresh(preferred);
  }

  /** The templates, the preferred one chosen. */
  refresh(preferred?: string): void {
    const was = preferred ?? this.template.value;
    this.template.replaceChildren(...templates().map((t) => { const o = document.createElement('option'); o.value = t.name; o.textContent = t.name; return o; }));
    if ([...this.template.options].some((o) => o.value === was)) this.template.value = was;
    this.original = null; setHidden(this.undo, true); setText(this.note, '');
  }

  private async improve(): Promise<void> {
    const prompt = this.field.value.trim();
    if (!prompt) { setText(this.note, 'Write a prompt to improve first.'); return; }
    const t = templates().find((x) => x.name === this.template.value);
    this.go.disabled = true;
    setText(this.note, 'Improving...');
    try {
      const better = await api.improvePrompt(prompt, fillPlaceholders(t?.text ?? '', { prompt }));
      this.original = this.field.value;
      this.history.set(better);
      setHidden(this.undo, false);
      setText(this.note, 'Improved.');
    } catch (err) {
      setText(this.note, err instanceof ApiError ? err.message : 'The formvis engine is offline (./formvis boot).');
    } finally { this.go.disabled = false; }
  }
}
