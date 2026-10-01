import type { Engine } from '../../engine';
import type { DocProfile } from '../../engine/types';
import { iccProfile } from '../../engine/icc';
import { api, ApiError } from '../../io/api';
import { toBase64 } from '../../io/icc-read';
import type { ColourView, Intent } from '../colour';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

const INTENTS: Array<[Intent, string]> = [['perceptual', 'Perceptual'], ['relative', 'Relative Colorimetric'], ['saturation', 'Saturation'], ['absolute', 'Absolute Colorimetric']];
const BUILT_IN: Array<['display-p3' | 'adobe-rgb', string]> = [['display-p3', 'Display P3'], ['adobe-rgb', 'Adobe RGB (1998)']];
const msg = (err: unknown): string => (err instanceof ApiError || err instanceof Error ? err.message : 'The engine did not answer.');

function row(label: string, control: HTMLElement): HTMLElement { const r = el('<label class="cv-dialog-row"><span></span></label>'); setText(r.querySelector('span') as HTMLElement, label); r.append(control); return r; }
function options(sel: HTMLSelectElement, items: Array<[string, string]>): void { sel.replaceChildren(...items.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; })); }

/** RGB profiles to assign or convert to: sRGB (the working space), the two built in, and the RGB ones on this computer. */
async function rgbChoices(): Promise<Array<[string, string]>> {
  const list: Array<[string, string]> = [['srgb', 'Working RGB: sRGB IEC61966-2.1'], ...BUILT_IN.map(([id, n]) => [id, n] as [string, string])];
  try { for (const p of (await api.colourProfiles()).profiles) if (p.space === 'RGB') list.push([`id:${p.id}`, p.name]); } catch { /* the engine offline: built-in only */ }
  return list;
}

async function profileOf(choice: string, label: string): Promise<DocProfile | null> {
  if (choice === 'srgb') return null;
  if (choice === 'display-p3' || choice === 'adobe-rgb') return { name: label, icc: toBase64(iccProfile(choice)) };
  return { name: label, icc: toBase64(await api.colourProfileBytes(choice.slice(3))) };
}

/** Edit > Assign Profile (1.53.5): the profile the document's numbers mean, the numbers unchanged. */
export class AssignProfileDialog extends Dialog {
  private readonly sel = el<HTMLSelectElement>('<select class="cv-input" aria-label="Profile"></select>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  constructor(private readonly engine: Engine) {
    super('Assign Profile', 460);
    this.body.append(el('<p class="cv-note">The numbers stay; how they look changes. Use Convert to Profile to keep the look.</p>'), row('Profile', this.sel), this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.ok());
  }
  async show(): Promise<void> { options(this.sel, await rgbChoices()); setText(this.note, ''); this.open(); }
  private async ok(): Promise<void> {
    try { this.engine.assignProfile(await profileOf(this.sel.value, this.sel.selectedOptions[0]?.textContent ?? '')); this.close(); } catch (err) { setText(this.note, msg(err)); }
  }
}

/** Edit > Convert to Profile (1.53.5): the look kept, the numbers converted by LittleCMS. */
export class ConvertProfileDialog extends Dialog {
  private readonly sel = el<HTMLSelectElement>('<select class="cv-input" aria-label="Destination profile"></select>');
  private readonly intent = el<HTMLSelectElement>('<select class="cv-input" aria-label="Intent"></select>');
  private readonly bpc = el<HTMLInputElement>('<input type="checkbox" aria-label="Use Black Point Compensation" checked>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  constructor(private readonly engine: Engine) {
    super('Convert to Profile', 460);
    options(this.intent, INTENTS); this.intent.value = 'relative';
    const from = el('<p class="cv-note cv-convert-from"></p>');
    this.body.append(from, row('Destination', this.sel), row('Intent', this.intent), row('Use Black Point Compensation', this.bpc), this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.ok());
  }
  async show(): Promise<void> {
    options(this.sel, await rgbChoices()); setText(this.note, '');
    setText(this.body.querySelector('.cv-convert-from') as HTMLElement, `Source: ${this.engine.current?.doc.profile?.name ?? 'sRGB IEC61966-2.1 (the working space)'}`);
    this.open();
  }
  private async ok(): Promise<void> {
    const src = this.engine.current?.doc.profile;
    try {
      setText(this.note, 'Converting...');
      const target = await profileOf(this.sel.value, this.sel.selectedOptions[0]?.textContent ?? '');
      if (this.engine.current?.doc.depth === 32) { this.engine.convertToProfileLinear(target, await api.linearMatrix({ source: src ? { icc: src.icc } : null, dest: target ? { icc: target.icc } : null })); this.close(); return; }
      const lut = await api.colourLut({ source: src ? { icc: src.icc } : null, dest: target ? { icc: target.icc } : null, intent: this.intent.value, bpc: this.bpc.checked });
      this.engine.convertToProfile(target, lut);
      this.close();
    } catch (err) { setText(this.note, msg(err)); }
  }
}

/** View > Proof Setup (1.53.5): the device to simulate (any profile here, CMYK included), its intent and black point. */
export class ProofSetupDialog extends Dialog {
  private readonly sel = el<HTMLSelectElement>('<select class="cv-input" aria-label="Device to Simulate"></select>');
  private readonly intent = el<HTMLSelectElement>('<select class="cv-input" aria-label="Rendering Intent"></select>');
  private readonly bpc = el<HTMLInputElement>('<input type="checkbox" aria-label="Black Point Compensation" checked>');
  private readonly file = el<HTMLInputElement>('<input type="file" accept=".icc,.icm" hidden data-role="load-profile">');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  constructor(private readonly colour: ColourView) {
    super('Proof Setup', 480);
    options(this.intent, INTENTS); this.intent.value = 'relative';
    const load = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Load Profile...</button>');
    load.addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', () => void this.load());
    this.body.append(row('Device to Simulate', this.sel), load, this.file, row('Rendering Intent', this.intent), row('Black Point Compensation', this.bpc), this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.ok());
  }
  async show(): Promise<void> { await this.list(this.colour.setup?.id); setText(this.note, ''); if (this.colour.setup) { this.intent.value = this.colour.setup.intent; this.bpc.checked = this.colour.setup.bpc; } this.open(); }
  private async list(pick?: string): Promise<void> {
    try {
      const all = (await api.colourProfiles()).profiles;
      options(this.sel, all.map((p) => [p.id, `${p.name} (${p.space})`] as [string, string]));
      if (pick && all.some((p) => p.id === pick)) this.sel.value = pick;
      if (!all.length) setText(this.note, 'No profiles were found on this computer: Load Profile adds one (a printer or press profile, .icc or .icm).');
    } catch (err) { setText(this.note, msg(err)); }
  }
  private async load(): Promise<void> {
    const f = this.file.files?.[0]; this.file.value = '';
    if (!f) return;
    try { const p = await api.addColourProfile(f); await this.list(p.id); setText(this.note, `Added ${p.name}.`); } catch (err) { setText(this.note, msg(err)); }
  }
  private ok(): void {
    if (!this.sel.value) { setText(this.note, 'Choose a device to simulate, or load its profile.'); return; }
    this.colour.saveSetup({ id: this.sel.value, name: (this.sel.selectedOptions[0]?.textContent ?? '').replace(/ \((RGB|CMYK|GRAY|LAB)\)$/, ''), intent: this.intent.value as Intent, bpc: this.bpc.checked });
    this.colour.proof = true;
    void this.colour.refresh();
    this.close();
  }
}

/** Embedded Profile Mismatch (1.53.5), when Preferences asks: keep it, convert to sRGB, or discard it. */
export class ProfileMismatchDialog extends Dialog {
  private readonly info = el('<p class="cv-note"></p>');
  private answer: ((v: 'keep' | 'convert' | 'discard') => void) | null = null;
  constructor() {
    super('Embedded Profile Mismatch', 480);
    this.body.append(this.info);
    this.button('Discard', 'ghost', () => this.done('discard'));
    this.button('Use Embedded Profile', 'ghost', () => this.done('keep'));
    this.button('Convert to Working Space', 'primary', () => this.done('convert'));
  }
  ask(file: string, profile: string): Promise<'keep' | 'convert' | 'discard'> {
    setText(this.info, `${file} has an embedded profile, ${profile}, that does not match the working space, sRGB IEC61966-2.1.`);
    this.open();
    return new Promise((res) => { this.answer = res; });
  }
  private done(v: 'keep' | 'convert' | 'discard'): void { const a = this.answer; this.answer = null; this.close(); a?.(v); }
  close(): void { if (this.answer) { const a = this.answer; this.answer = null; a('convert'); } super.close(); }
}
