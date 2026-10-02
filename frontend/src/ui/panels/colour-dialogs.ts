import type { Engine } from '../../engine';
import type { ChannelPixels, DocProfile, ID } from '../../engine/types';
import type { Lut3x4, Lut4 } from '../../engine/colour-lut';
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

/** CMYK profiles on this computer (1.57.9), for Assign and Convert to Profile in a CMYK document. */
async function cmykChoices(): Promise<Array<[string, string]>> {
  const list: Array<[string, string]> = [];
  try { for (const p of (await api.colourProfiles()).profiles) if (p.space === 'CMYK') list.push([`id:${p.id}`, p.name]); } catch { /* the engine offline: none */ }
  return list;
}

/** The app's fetcher of a CMYK profile's display and separation tables (1.57.9). */
export type CmykTables = (profile: DocProfile) => Promise<{ out: Lut4; in: Lut3x4 }>;

async function profileOf(choice: string, label: string): Promise<DocProfile | null> {
  if (choice === 'srgb') return null;
  if (choice === 'display-p3' || choice === 'adobe-rgb') return { name: label, icc: toBase64(iccProfile(choice)) };
  return { name: label, icc: toBase64(await api.colourProfileBytes(choice.slice(3))) };
}

/** Edit > Assign Profile (1.53.5): the profile the document's numbers mean, the numbers unchanged. */
export class AssignProfileDialog extends Dialog {
  private readonly sel = el<HTMLSelectElement>('<select class="cv-input" aria-label="Profile"></select>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  constructor(private readonly engine: Engine, private readonly tables: CmykTables, private readonly convert: () => Promise<void>) {
    super('Assign Profile', 460);
    this.body.append(el('<p class="cv-note">The numbers stay; how they look changes. Use Convert to Profile to keep the look.</p>'), row('Profile', this.sel), this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.ok());
  }
  async show(): Promise<void> {
    // Lab (1.57.9): its colours are absolute, so a profile is given to them by converting into it.
    if (this.engine.current?.doc.mode === 'lab') { await this.convert(); return; }
    options(this.sel, this.engine.current?.doc.mode === 'cmyk' ? await cmykChoices() : await rgbChoices()); setText(this.note, ''); this.open();
  }
  private async ok(): Promise<void> {
    try {
      const profile = await profileOf(this.sel.value, this.sel.selectedOptions[0]?.textContent ?? '');
      if (this.engine.current?.doc.mode === 'cmyk') {
        // CMYK (1.57.9): the inks stay and are shown through the new press's tables, fetched first; one step.
        if (!profile) return;
        const t = await this.tables(profile);
        this.engine.assignCmykProfile(profile, t.out, t.in);
      } else this.engine.assignProfile(profile);
      this.close();
    } catch (err) { setText(this.note, msg(err)); }
  }
}

/** Edit > Convert to Profile (1.53.5): the look kept, the numbers converted by LittleCMS. */
export class ConvertProfileDialog extends Dialog {
  private readonly sel = el<HTMLSelectElement>('<select class="cv-input" aria-label="Destination profile"></select>');
  private readonly intent = el<HTMLSelectElement>('<select class="cv-input" aria-label="Intent"></select>');
  private readonly bpc = el<HTMLInputElement>('<input type="checkbox" aria-label="Use Black Point Compensation" checked>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  constructor(private readonly engine: Engine, private readonly tables: CmykTables | null = null) {
    super('Convert to Profile', 460);
    options(this.intent, INTENTS); this.intent.value = 'relative';
    const from = el('<p class="cv-note cv-convert-from"></p>');
    this.body.append(from, row('Destination', this.sel), row('Intent', this.intent), row('Use Black Point Compensation', this.bpc), this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.ok());
  }
  async show(): Promise<void> {
    const mode = this.engine.current?.doc.mode;
    options(this.sel, mode === 'cmyk' ? await cmykChoices() : await rgbChoices()); setText(this.note, '');
    setText(this.body.querySelector('.cv-convert-from') as HTMLElement, `Source: ${mode === 'lab' ? 'Lab (D50); it becomes RGB in the destination' : this.engine.current?.doc.profile?.name ?? 'sRGB IEC61966-2.1 (the working space)'}`);
    this.open();
  }
  private async ok(): Promise<void> {
    // Lab (1.57.9): to RGB first (exactly, into sRGB), then on as an RGB document; two steps.
    if (this.engine.current?.doc.mode === 'lab') this.engine.setRgbFromLab();
    const src = this.engine.current?.doc.profile;
    try {
      setText(this.note, 'Converting...');
      const target = await profileOf(this.sel.value, this.sel.selectedOptions[0]?.textContent ?? '');
      const p = this.engine.current;
      if (p?.doc.mode === 'cmyk' && src && target && this.tables) {
        // CMYK (1.57.9): each layer's inks through LittleCMS to the new press, pure black kept; one step.
        if (src.icc === target.icc) { setText(this.note, 'The document is already in that profile.'); return; }
        const inks = new Map<ID, ChannelPixels>();
        for (const l of p.doc.layers) {
          const ch = l.channels;
          if (ch?.mode !== 'cmyk') continue;
          const n = ch.width * ch.height, u8 = new Uint8Array(n * 4);
          for (let j = 0; j < n; j++) for (let c = 0; c < 4; c++) u8[j * 4 + c] = Math.round(Math.max(0, Math.min(1, ch.data[j * 5 + c])) * 255);
          const out = await api.convertInk(u8, ch.width, ch.height, src.icc, target.icc, this.intent.value), d = new Float32Array(n * 5);
          for (let j = 0; j < n; j++) { for (let c = 0; c < 4; c++) d[j * 5 + c] = out[j * 4 + c] / 255; d[j * 5 + 4] = ch.data[j * 5 + 4]; }
          inks.set(l.id, { ...ch, data: d });
        }
        const t = await this.tables(target);
        this.engine.convertCmykProfile(target, inks, t.out, t.in);
        this.close();
        return;
      }
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
