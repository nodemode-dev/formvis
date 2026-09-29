import { api, ApiError } from '../../io/api';
import { templates } from '../../io/prompt-templates';
import { el, setHidden, setText } from '../dom';

/** Improve Prompt (1.51.5): a template, Improve and Restore beside a prompt, rewriting it through the language model
 *  set in Preferences > Plugins; Restore puts the original back. */
export class PromptImprover {
  readonly el = el('<div class="cv-improve"></div>');
  private readonly template = el<HTMLSelectElement>('<select class="cv-input" aria-label="Prompt template"></select>');
  private readonly go = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Improve</button>');
  private readonly undo = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" hidden>Restore</button>');
  private readonly note = el('<span class="cv-note cv-improve-note" role="status"></span>');
  private original: string | null = null;

  constructor(private readonly field: HTMLInputElement | HTMLTextAreaElement, preferred = 'Richer detail') {
    this.el.append(this.template, this.go, this.undo, this.note);
    this.go.addEventListener('click', () => void this.improve());
    this.undo.addEventListener('click', () => { if (this.original !== null) { this.field.value = this.original; this.original = null; setHidden(this.undo, true); setText(this.note, 'Restored.'); } });
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
      const better = await api.improvePrompt(prompt, t?.text ?? '');
      this.original = this.field.value;
      this.field.value = better;
      setHidden(this.undo, false);
      setText(this.note, 'Improved.');
    } catch (err) {
      setText(this.note, err instanceof ApiError ? err.message : 'The formvis engine is offline (./formvis boot).');
    } finally { this.go.disabled = false; }
  }
}
