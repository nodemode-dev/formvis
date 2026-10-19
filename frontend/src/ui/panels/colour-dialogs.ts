import type { Engine } from '../../engine';
import type { ChannelPixels, DocMode, DocProfile, ID } from '../../engine/types';
import type { Lut3x4, Lut4 } from '../../engine/colour-lut';
import { deepFromRaster } from '../../engine/deep';
import { iccProfile } from '../../engine/icc';
import { loadPrefs } from '../prefs';
import { api, ApiError } from '../../io/api';
import { embeddedProfile, toBase64 } from '../../io/icc-read';
import { PROOF_KINDS, type ColourView, type Intent, type ProofSetup } from '../colour';
import { displayLine } from '../colour-display';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

export const INTENTS: Array<[Intent, string]> = [['perceptual', 'Perceptual'], ['relative', 'Relative Colorimetric'], ['saturation', 'Saturation'], ['absolute', 'Absolute Colorimetric']];
const BUILT_IN: Array<['display-p3' | 'adobe-rgb', string]> = [['display-p3', 'Display P3'], ['adobe-rgb', 'Adobe RGB (1998)']];
const msg = (err: unknown): string => (err instanceof ApiError || err instanceof Error ? err.message : 'The engine did not answer.');

function row(label: string, control: HTMLElement): HTMLElement { const r = el('<label class="cv-dialog-row"><span></span></label>'); setText(r.querySelector('span') as HTMLElement, label); r.append(control); return r; }
function options(sel: HTMLSelectElement, items: Array<[string, string]>): void { sel.replaceChildren(...items.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; })); }

/** RGB profiles to assign or convert to: sRGB (the working space), the two built in, and the RGB ones on this computer. */
export async function rgbChoices(): Promise<Array<[string, string]>> {
  const list: Array<[string, string]> = [['srgb', 'Working RGB: sRGB IEC61966-2.1'], ...BUILT_IN.map(([id, n]) => [id, n] as [string, string])];
  try { for (const p of (await api.colourProfiles()).profiles) if (p.space === 'RGB') list.push([`id:${p.id}`, p.name]); } catch { /* the engine offline: built-in only */ }
  return list;
}

/** CMYK profiles on this computer (1.57.9), for Assign and Convert to Profile in a CMYK document. */
export async function cmykChoices(): Promise<Array<[string, string]>> {
  const list: Array<[string, string]> = [];
  try { for (const p of (await api.colourProfiles()).profiles) if (p.space === 'CMYK') list.push([`id:${p.id}`, p.name]); } catch { /* the engine offline: none */ }
  return list;
}

/** Gray profiles (DEV_PLAN 28.2): the three LittleCMS makes itself and any on this computer. */
async function grayChoices(): Promise<Array<[string, string]>> {
  const list: Array<[string, string]> = [];
  try { for (const p of (await api.colourProfiles()).profiles) if (p.space === 'GRAY') list.push([`id:${p.id}`, p.name]); } catch { /* the engine offline: none */ }
  return list;
}

/** The app's fetcher of a CMYK profile's display and separation tables (1.57.9). */
export type CmykTables = (profile: DocProfile) => Promise<{ out: Lut4; in: Lut3x4 }>;

export type Space = 'rgb' | 'cmyk' | 'gray' | 'lab';
const SPACE_MODE: Record<Space, DocMode> = { rgb: 'rgb', cmyk: 'cmyk', gray: 'grayscale', lab: 'lab' };

/** Convert to Profile and mode changes at the document's own depth (DEV_PLAN 28.2): every pixel layer's channels (the
 *  16-bit floats, the ink, the Lab values, or the 8-bit pixels widened) go to the engine's LittleCMS, which converts in
 *  double precision and rounds once to 16 bits (8 for an 8-bit document), with rendering intent, black point
 *  compensation and optional dither; the results replace the layers in one step. `choice` is the destination as the
 *  dialog lists it ('srgb', 'display-p3', 'adobe-rgb', 'lab' or 'id:' and a listed id). */
export async function convertDocumentDeep(engine: Engine, choice: string, target: DocProfile | null, space: Space, o: { intent: string; bpc: boolean; dither: boolean }, tables: CmykTables | null): Promise<boolean> {
  const p = engine.current;
  if (!p) return false;
  const mode = p.doc.mode ?? 'rgb', depth: 8 | 16 = p.doc.depth === 16 ? 16 : 8, from = mode === 'cmyk' ? 'cmyk' : mode === 'lab' ? 'lab' : 'rgb';
  if (space === 'cmyk' && (!tables || !target)) throw new Error('No CMYK tables are available for that profile.');
  const source = from === 'lab' ? '' : p.doc.profile?.icc ?? '', dest = space === 'lab' ? 'id:builtin:lab' : choice.startsWith('id:') ? choice : target?.icc ?? '';
  const out = new Map<ID, ChannelPixels>();
  for (const l of p.doc.layers) {
    if (!l.raster || l.isGroup || l.adjustment) continue;
    const ch = l.channels ?? deepFromRaster(l.raster);
    if (ch.mode !== from) continue;
    const r = await api.convertDeep(ch.data, ch.width, ch.height, from, source, dest, { intent: o.intent, bpc: o.bpc, dither: o.dither, bits: depth });
    out.set(l.id, { mode: r.space === 'cmyk' ? 'cmyk' : r.space === 'lab' ? 'lab' : 'rgb', n: r.space === 'cmyk' ? 4 : 3, width: ch.width, height: ch.height, data: r.data });
  }
  if (!out.size) throw new Error('There are no pixel layers to convert.');
  const t = space === 'cmyk' && tables && target ? await tables(target) : null;
  return engine.convertDeepDocument({ mode: SPACE_MODE[space], profile: space === 'lab' ? null : target, depth, layers: out, cmyk: t ? { lut: t.out, inLut: t.in } : undefined });
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
  private readonly file = el<HTMLInputElement>('<input type="file" accept=".icc,.icm" hidden data-role="assign-load-profile">');
  constructor(private readonly engine: Engine, private readonly tables: CmykTables, private readonly convert: () => Promise<void>) {
    super('Assign Profile', 460);
    const load = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Load Profile...</button>');
    load.addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', () => void this.load());
    this.body.append(el('<p class="cv-note">The numbers stay; how they look changes. Use Convert to Profile to keep the look.</p>'), row('Profile', this.sel), load, this.file, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.ok());
    this.remember();
  }
  async show(): Promise<void> {
    // Lab (1.57.9): its colours are absolute, so a profile is given to them by converting into it.
    if (this.engine.current?.doc.mode === 'lab') { await this.convert(); return; }
    await this.list(); setText(this.note, ''); this.open();
  }
  private async list(pick?: string): Promise<void> {
    const mode = this.engine.current?.doc.mode;
    const items = mode === 'cmyk' ? await cmykChoices() : mode === 'grayscale' ? await grayChoices() : await rgbChoices();
    options(this.sel, mode === 'cmyk' ? items : [['none', "Don't Color Manage This Document"], ...items]);
    if (pick && items.some(([v]) => v === pick)) this.sel.value = pick;
  }
  private async load(): Promise<void> {
    const f = this.file.files?.[0]; this.file.value = '';
    if (!f) return;
    try { const p = await api.addColourProfile(f); await this.list(`id:${p.id}`); setText(this.note, `Added ${p.name}.`); } catch (err) { setText(this.note, msg(err)); }
  }
  private async ok(): Promise<void> {
    try {
      if (this.sel.value === 'none' && this.engine.current?.doc.mode !== 'cmyk') { this.engine.assignProfile(null); this.close(); return; }
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
  private readonly dither = el<HTMLInputElement>('<input type="checkbox" aria-label="Use Dither">');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private readonly spaces = new Map<string, Space>();
  constructor(private readonly engine: Engine, private readonly tables: CmykTables | null = null) {
    super('Convert to Profile', 460);
    options(this.intent, INTENTS); this.intent.value = 'relative';
    const from = el('<p class="cv-note cv-convert-from"></p>');
    this.body.append(from, row('Destination', this.sel), row('Intent', this.intent), row('Use Black Point Compensation', this.bpc), row('Use Dither (8-bit/channel)', this.dither), this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.ok());
    this.remember([this.intent, this.bpc, this.dither]);   // the intent, compensation and dither are Color Settings' (Preferences)
  }
  async show(): Promise<void> {
    const mode = this.engine.current?.doc.mode, depth = this.engine.current?.doc.depth ?? 8, saved = loadPrefs().colour;
    this.intent.value = saved.intent; this.bpc.checked = saved.bpc; this.dither.checked = saved.dither;
    options(this.sel, await this.choices(mode, depth)); setText(this.note, '');
    setText(this.body.querySelector('.cv-convert-from') as HTMLElement, `Source: ${mode === 'lab' ? 'Lab (D50)' : this.engine.current?.doc.profile?.name ?? 'sRGB IEC61966-2.1 (the working space)'} · ${depth}-bit ${mode === 'cmyk' ? 'CMYK' : mode === 'lab' ? 'Lab' : mode === 'grayscale' ? 'gray' : 'RGB'}`);
    this.open();
  }
  private async choices(mode: string | undefined, depth: number): Promise<Array<[string, string]>> {
    this.spaces.clear();
    const mark = (list: Array<[string, string]>, space: Space): Array<[string, string]> => { for (const [v] of list) this.spaces.set(v, space); return list; };
    const rgb = mark(await rgbChoices(), 'rgb');
    if (depth === 32) return rgb;
    const cmyk = mark(await cmykChoices(), 'cmyk'), gray = mark(await grayChoices(), 'gray'), lab = mark([['lab', 'Lab Color (D50)']], 'lab');
    return (mode === 'cmyk' ? [cmyk, rgb, gray, lab] : [rgb, cmyk, gray, lab]).flat();
  }
  private async ok(): Promise<void> {
    const src = this.engine.current?.doc.profile, space = this.spaces.get(this.sel.value) ?? 'rgb';
    try {
      setText(this.note, 'Converting...');
      const label = this.sel.selectedOptions[0]?.textContent ?? '', target = space === 'lab' ? null : await profileOf(this.sel.value, label);
      const p = this.engine.current, mode = p?.doc.mode ?? 'rgb', depth = p?.doc.depth ?? 8, dither = this.dither.checked;
      if (p && depth !== 32 && !(space === 'cmyk' && mode === 'cmyk' && depth === 8 && !dither) && !(space === 'rgb' && mode !== 'cmyk' && mode !== 'lab' && depth === 8 && !dither)) {
        // 16 bits, a change of mode, Lab, or dither (DEV_PLAN 28.2): the pixels' own floats through LittleCMS in double precision, rounded once, in one step.
        if (!await convertDocumentDeep(this.engine, this.sel.value, target, space, { intent: this.intent.value, bpc: this.bpc.checked, dither }, this.tables)) { setText(this.note, 'Nothing was converted.'); return; }
        this.close();
        return;
      }
      if (space !== 'rgb' && !(space === 'cmyk' && mode === 'cmyk')) throw new Error('A 32-bit document converts only between RGB profiles. Choose Image > Mode > 16 Bits/Channel first.');
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

export interface ModeConvertAnswer { space: Space; choice: string; target: DocProfile | null; intent: string; bpc: boolean; dither: boolean }

/** Image > Mode > Convert Mode (RGB Color, Grayscale, Lab Color): the destination profile, rendering intent, black point
 *  compensation and dither for the conversion, taken from Color Settings and changeable here for this one conversion. */
export class ModeConvertDialog extends Dialog {
  private readonly mode = el<HTMLSelectElement>('<select class="cv-input" aria-label="Convert to"></select>');
  private readonly sel = el<HTMLSelectElement>('<select class="cv-input" aria-label="Profile"></select>');
  private readonly intent = el<HTMLSelectElement>('<select class="cv-input" aria-label="Intent"></select>');
  private readonly bpc = el<HTMLInputElement>('<input type="checkbox" aria-label="Use Black Point Compensation" checked>');
  private readonly dither = el<HTMLInputElement>('<input type="checkbox" aria-label="Use Dither">');
  private readonly from = el('<p class="cv-note cv-convert-from"></p>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private lists: Record<Space, Array<[string, string]>> = { rgb: [], cmyk: [], gray: [], lab: [['lab', 'Lab Color (D50)']] };
  /** Runs the conversion; resolves to a message when it failed, or null when the document changed. */
  onApply: ((a: ModeConvertAnswer) => Promise<string | null>) | null = null;
  constructor(private readonly engine: Engine) {
    super('Convert Mode', 460);
    options(this.mode, [['rgb', 'RGB Color'], ['gray', 'Grayscale'], ['lab', 'Lab Color']]);
    options(this.intent, INTENTS);
    this.mode.addEventListener('change', () => this.fillProfiles());
    this.body.append(this.from, row('Convert to', this.mode), row('Profile', this.sel), row('Intent', this.intent), row('Use Black Point Compensation', this.bpc), row('Use Dither (8-bit/channel)', this.dither), this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.ok());
  }
  async show(target: Space = 'gray'): Promise<void> {
    const p = this.engine.current;
    if (!p) return;
    const saved = loadPrefs().colour, m = p.doc.mode ?? 'rgb';
    this.intent.value = saved.intent; this.bpc.checked = saved.bpc; this.dither.checked = saved.dither;
    this.lists.rgb = await rgbChoices(); this.lists.gray = await grayChoices();
    const name = m === 'lab' ? 'Lab (D50)' : p.doc.profile?.name ?? 'sRGB IEC61966-2.1 (the working space)';
    setText(this.from, `Source: ${name} · ${p.doc.depth ?? 8}-bit ${m === 'cmyk' ? 'CMYK' : m === 'lab' ? 'Lab' : m === 'grayscale' ? 'gray' : 'RGB'}`);
    for (const o of Array.from(this.mode.options)) o.disabled = (o.value === 'rgb' && m === 'rgb') || (o.value === 'gray' && m === 'grayscale') || (o.value === 'lab' && (m === 'lab' || m === 'grayscale'));
    this.mode.value = target; if (this.mode.selectedOptions[0]?.disabled) this.mode.value = Array.from(this.mode.options).find((o) => !o.disabled)?.value ?? target;
    this.fillProfiles(); setText(this.note, '');
    this.open();
  }
  private fillProfiles(): void {
    const space = this.mode.value as Space, list = this.lists[space], c = loadPrefs().colour;
    options(this.sel, list);
    this.sel.disabled = space === 'lab';
    const ref = space === 'rgb' ? c.rgb : space === 'gray' ? c.gray : 'lab';
    if (list.some(([v]) => v === ref)) this.sel.value = ref;
  }
  private async ok(): Promise<void> {
    const space = this.mode.value as Space;
    try {
      setText(this.note, 'Converting...');
      const label = this.sel.selectedOptions[0]?.textContent ?? '', target = space === 'lab' ? null : await profileOf(this.sel.value, label);
      const err = await this.onApply?.({ space, choice: this.sel.value, target, intent: this.intent.value, bpc: this.bpc.checked, dither: this.dither.checked });
      if (err) { setText(this.note, err); return; }
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
  private readonly paper = el<HTMLInputElement>('<input type="checkbox" aria-label="Simulate Paper Color">');
  private readonly ink = el<HTMLInputElement>('<input type="checkbox" aria-label="Simulate Black Ink">');
  private readonly delta = el<HTMLInputElement>('<input class="cv-input" type="number" min="0.1" max="50" step="0.1" aria-label="Gamut Warning threshold in delta E">');
  private readonly presetSel = el<HTMLSelectElement>('<select class="cv-input" aria-label="Preset"></select>');
  private readonly presetName = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="60" placeholder="Preset name" aria-label="Preset name">');
  private readonly deleteBtn = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Delete Preset</button>');
  private readonly monitor = el('<p class="cv-note"></p>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  constructor(private readonly colour: ColourView) {
    super('Proof Setup', 480);
    options(this.intent, INTENTS); this.intent.value = 'relative';
    const load = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Load Profile...</button>');
    load.addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', () => void this.load());
    const save = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Save Preset</button>');
    save.addEventListener('click', () => this.savePreset());
    this.deleteBtn.addEventListener('click', () => this.deletePreset());
    this.presetSel.addEventListener('change', () => this.pickPreset());
    this.paper.addEventListener('change', () => this.terms());
    const manage = el('<div class="cv-dialog-row"><span></span></div>');
    manage.append(this.presetName, save, this.deleteBtn);
    this.body.append(row('Preset', this.presetSel), manage, row('Device to Simulate', this.sel), load, this.file, row('Rendering Intent', this.intent), row('Black Point Compensation', this.bpc),
      row('Simulate Paper Color', this.paper), row('Simulate Black Ink', this.ink), row('Gamut Warning threshold (delta E)', this.delta), this.monitor, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.ok());
  }
  async show(): Promise<void> {
    await this.list(this.colour.setup?.id); setText(this.note, '');
    this.delta.value = String(this.colour.gamutDelta);
    const s = this.colour.setup;
    if (s) this.apply(s);
    this.terms();
    this.fillPresets(this.colour.preset ? `k:${this.colour.preset}` : s ? this.colour.presets.find((p) => JSON.stringify(p.setup) === JSON.stringify({ ...s, name: p.setup.name }))?.id ?? '' : '');
    setText(this.monitor, displayLine(this.colour.display, loadPrefs().colour.useDisplay));
    this.open();
  }
  /** Paper white needs the absolute intent and the press's own black, so those controls give way to it. */
  private terms(): void {
    const paper = this.paper.checked;
    if (paper) this.ink.checked = true;
    this.ink.disabled = paper; this.intent.disabled = paper; this.bpc.disabled = paper || this.ink.checked;
  }
  private apply(s: ProofSetup): void {
    if ([...this.sel.options].some((o) => o.value === s.id)) this.sel.value = s.id;
    this.intent.value = s.intent; this.bpc.checked = s.bpc; this.paper.checked = !!s.paper; this.ink.checked = !!s.ink;
    this.terms();
  }
  private current(): ProofSetup | null {
    if (!this.sel.value) return null;
    return { id: this.sel.value, name: (this.sel.selectedOptions[0]?.textContent ?? '').replace(/ \((RGB|CMYK|GRAY|LAB)\)$/, ''), intent: this.intent.value as Intent, bpc: this.bpc.checked, ...(this.paper.checked ? { paper: true } : {}), ...(this.ink.checked ? { ink: true } : {}) };
  }
  private fillPresets(pick: string): void {
    options(this.presetSel, [['', 'Custom'], ...PROOF_KINDS.map(([k, n]) => [`k:${k}`, n] as [string, string]), ...this.colour.presets.map((p) => [p.id, p.name] as [string, string])]);
    this.presetSel.value = pick;
    this.deleteBtn.disabled = !pick;
  }
  private pickPreset(): void {
    const p = this.colour.presets.find((x) => x.id === this.presetSel.value);
    this.deleteBtn.disabled = !p;
    if (this.presetSel.value.startsWith('k:')) { setText(this.note, 'A built-in preset: OK shows the view without a device from the list.'); return; }
    if (!p) return;
    this.apply(p.setup);
    setText(this.note, [...this.sel.options].some((o) => o.value === p.setup.id) ? '' : `The profile ${p.setup.name} is not on this computer: Load Profile adds it.`);
  }
  private savePreset(): void {
    const name = this.presetName.value.trim(), setup = this.current();
    if (!name) { setText(this.note, 'Name the preset first.'); this.presetName.focus(); return; }
    if (!setup) { setText(this.note, 'Choose a device to simulate first.'); return; }
    const existing = this.colour.presets.find((p) => p.name.toLowerCase() === name.toLowerCase()), preset = { id: existing?.id ?? `proof-${Date.now().toString(36)}`, name, setup };
    this.colour.savePresets(existing ? this.colour.presets.map((p) => (p.id === existing.id ? preset : p)) : [...this.colour.presets, preset]);
    this.presetName.value = '';
    this.fillPresets(preset.id);
    setText(this.note, `Saved the preset "${name}".`);
  }
  private deletePreset(): void {
    const id = this.presetSel.value;
    if (!id) return;
    this.colour.savePresets(this.colour.presets.filter((p) => p.id !== id));
    this.fillPresets('');
  }
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
    const pick = this.presetSel.value, kind = PROOF_KINDS.find(([k]) => `k:${k}` === pick)?.[0] ?? null;
    if (Number(this.delta.value) !== this.colour.gamutDelta && this.delta.value) this.colour.setGamutDelta(Number(this.delta.value));
    if (kind) { this.colour.usePreset(kind); this.close(); return; }
    this.colour.preset = null;
    const setup = this.current();
    if (!setup) { setText(this.note, 'Choose a device to simulate, or load its profile.'); return; }
    this.colour.saveSetup(setup);
    this.colour.proof = true;
    void this.colour.refresh();
    this.close();
  }
}

/** Embedded Profile Mismatch (1.53.5), when Preferences asks: keep it, convert to sRGB, or discard it. */
export class ProfileMismatchDialog extends Dialog {
  private readonly info = el('<p class="cv-note"></p>');
  private answer: ((v: 'keep' | 'convert' | 'discard' | 'cancel') => void) | null = null;
  constructor() {
    super('Embedded Profile Mismatch', 480);
    this.body.append(this.info);
    this.button('Cancel', 'ghost', () => this.done('cancel'));
    this.button('Discard', 'ghost', () => this.done('discard'));
    this.button('Use Embedded Profile', 'ghost', () => this.done('keep'));
    this.button('Convert to Working Space', 'primary', () => this.done('convert'));
  }
  ask(file: string, profile: string, working = 'sRGB IEC61966-2.1'): Promise<'keep' | 'convert' | 'discard' | 'cancel'> {
    setText(this.info, `${file} has an embedded profile, ${profile}, that does not match the working space, ${working}.`);
    this.open();
    return new Promise((res) => { this.answer = res; });
  }
  private done(v: 'keep' | 'convert' | 'discard' | 'cancel'): void { const a = this.answer; this.answer = null; this.close(); a?.(v); }
  close(): void { if (this.answer) { const a = this.answer; this.answer = null; a('cancel'); } super.close(); }
}

/** Missing Profile (DEV_PLAN 28.2), when Color Settings asks: a picture with no profile is read in the working space, or
 *  left as its numbers, unmanaged. */
export class MissingProfileDialog extends Dialog {
  private readonly info = el('<p class="cv-note"></p>');
  private answer: ((v: 'assume' | 'leave' | 'cancel') => void) | null = null;
  constructor() {
    super('Missing Profile', 480);
    this.body.append(this.info);
    this.button('Cancel', 'ghost', () => this.done('cancel'));
    this.button('Leave as Is (Don\'t Color Manage)', 'ghost', () => this.done('leave'));
    this.button('Assume Working Space', 'primary', () => this.done('assume'));
  }
  ask(file: string, working: string): Promise<'assume' | 'leave' | 'cancel'> {
    setText(this.info, `${file} has no embedded profile. Assume the working space, ${working}, or leave its numbers unmanaged.`);
    this.open();
    return new Promise((res) => { this.answer = res; });
  }
  private done(v: 'assume' | 'leave' | 'cancel'): void { const a = this.answer; this.answer = null; this.close(); a?.(v); }
  close(): void { if (this.answer) { const a = this.answer; this.answer = null; a('cancel'); } super.close(); }
}

/** Edit > Profile Info: what the document's profile (or a chosen picture's or .icc file's) says about itself. */
export class ProfileInfoDialog extends Dialog {
  private readonly fields = new Map<string, HTMLElement>();
  private readonly file = el<HTMLInputElement>('<input type="file" accept=".icc,.icm,.png,.jpg,.jpeg,.webp" hidden data-role="info-profile-file">');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private readonly source = el('<p class="cv-note"></p>');
  constructor(private readonly engine: Engine) {
    super('Profile Info', 460);
    const choose = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Choose File...</button>');
    choose.addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', () => void this.fromFile());
    this.body.append(this.source);
    for (const k of ['Name', 'Colour space', 'Device class', 'Connection space', 'Version', 'Size', 'Total ink', 'Copyright']) {
      const out = el('<span></span>');
      this.fields.set(k, out);
      this.body.append(row(k, out));
    }
    this.body.append(choose, this.file, this.note);
    this.button('Close', 'primary', () => this.close());
  }
  async show(): Promise<void> {
    const prof = this.engine.current?.doc.profile ?? null;
    await this.fill(prof ? { icc: prof.icc } : { id: 'builtin:srgb' }, prof ? `This document: ${prof.name}` : 'This document has no profile; it is read as sRGB.');
    this.open();
  }
  private async fill(ref: { icc?: string; id?: string }, source: string): Promise<void> {
    setText(this.note, '');
    try {
      const i = await api.profileInfo(ref), put = (k: string, v: string): void => setText(this.fields.get(k) as HTMLElement, v);
      setText(this.source, source);
      put('Name', i.name); put('Colour space', i.space); put('Device class', i.deviceClass ?? 'Not stated'); put('Connection space', i.pcs ?? 'Not stated');
      put('Version', i.version ?? 'Not stated'); put('Size', i.size ? `${(i.size / 1024).toFixed(1)} KB` : 'Not stated'); put('Total ink', i.tac === null ? 'Not applicable' : `${i.tac}%`);
      put('Copyright', i.copyright ?? 'Not stated');
    } catch (err) { setText(this.note, msg(err)); }
  }
  private async fromFile(): Promise<void> {
    const f = this.file.files?.[0]; this.file.value = '';
    if (!f) return;
    const head = new Uint8Array(await f.slice(0, 40).arrayBuffer());
    const icc = String.fromCharCode(...head.subarray(36, 40)) === 'acsp' ? new Uint8Array(await f.arrayBuffer()) : await embeddedProfile(f).catch(() => null);
    if (!icc) { setText(this.note, `${f.name} has no embedded colour profile.`); return; }
    await this.fill({ icc: toBase64(icc) }, `File: ${f.name}`);
  }
}
