import type { Engine } from '../../engine';
import { api, type GenerativeStatus } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setHidden, setText } from '../dom';

/** Edit > Generative Fill: a prompt for what to paint into the selection, sent by the sonny engine to fal (FLUX.1
 *  Fill [pro]); an empty prompt removes what the selection covers (FLUX.1 Erase [pro]). Until a key is saved the dialog
 *  asks for one; the engine keeps it in its data folder and never hands it back to the page. */
export class GenerativeDialog extends Dialog {
  private readonly prompt = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="true" placeholder="Describe what to add, or leave empty to remove">');
  private readonly keyRow = el('<div class="cv-panel-section"></div>');
  private readonly key = el<HTMLInputElement>('<input class="cv-input" type="password" autocomplete="off" spellcheck="false" placeholder="fal API key">');
  private readonly state = el('<p class="cv-note"></p>');
  private readonly forget: HTMLButtonElement;
  private status: GenerativeStatus | null = null;

  constructor(private readonly engine: Engine) {
    super('Generative Fill', 440);
    this.body.appendChild(this.prompt);
    this.body.appendChild(el('<p class="cv-note">The result arrives as a new layer masked to the selection. fal charges about $0.05 per megapixel of the area sent.</p>'));
    this.keyRow.append(this.key, el('<p class="cv-note">Get a key at fal.ai. The sonny engine keeps it in its data folder on this computer.</p>'));
    this.body.appendChild(this.keyRow);
    this.body.appendChild(this.state);
    this.forget = this.button('Forget key', 'ghost', () => void this.forgetKey());
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Generate', 'primary', () => void this.generate());
  }

  async show(): Promise<void> {
    this.status = await api.generativeStatus();
    this.sync();
    this.open();
    this.prompt.focus();
    this.prompt.select();
  }

  private sync(): void {
    const s = this.status;
    setHidden(this.keyRow, !s || s.configured);
    setHidden(this.forget, s?.source !== 'settings');
    setText(this.state, !s ? 'The sonny engine is offline. Start it with ./sonny boot.'
      : s.configured ? `fal key set ${s.source === 'environment' ? 'by FAL_KEY in the environment' : 'in sonny'}.` : 'Add a fal API key to generate.');
  }

  private async forgetKey(): Promise<void> {
    try { this.status = await api.forgetGenerativeKey(); } catch (err) { setText(this.state, err instanceof Error ? err.message : 'The key could not be removed.'); return; }
    this.sync();
  }

  private async generate(): Promise<void> {
    if (!this.status) return;
    if (!this.status.configured) {
      const key = this.key.value.trim();
      if (!key) { setText(this.state, 'Paste a fal API key first.'); this.key.focus(); return; }
      try { this.status = await api.saveGenerativeKey(key); } catch (err) { setText(this.state, err instanceof Error ? err.message : 'The key could not be saved.'); return; }
      this.key.value = '';
      this.sync();
    }
    const prompt = this.prompt.value;
    this.close();
    await this.engine.task(() => this.engine.generativeFill(prompt, (image, mask) => api.generativeFill(image, mask, prompt)));
  }
}
