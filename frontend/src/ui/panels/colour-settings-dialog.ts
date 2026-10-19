import type { Engine } from '../../engine';
import { api, ApiError } from '../../io/api';
import { BUILTIN_COLOUR_PRESETS, INTENT_CHOICES, POLICIES, cleanColour, mismatchPref, type ColourPreset, type ColourSettings, type Policy } from '../colour-settings';
import type { ColourView, Intent } from '../colour';
import { displayLine } from '../colour-display';
import type { Commands } from '../commands';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { loadPrefs, savePrefs } from '../prefs';
import { toast } from '../toast';
import { checkRow, selectRow, type Row } from './controls';
import { MissingProfileDialog } from './colour-dialogs';

const BUILT_IN_RGB: Array<[string, string]> = [['srgb', 'sRGB IEC61966-2.1'], ['display-p3', 'Display P3'], ['adobe-rgb', 'Adobe RGB (1998)']];
const msg = (err: unknown): string => (err instanceof ApiError || err instanceof Error ? err.message : 'The engine did not answer.');

/** Options patched in place: the same count and values keep their nodes (no rebuild while the dialog is up). */
function patch(sel: HTMLSelectElement, want: ReadonlyArray<readonly [string, string]>): void {
  while (sel.options.length > want.length) sel.remove(sel.options.length - 1);
  want.forEach(([v, t], i) => { const o = sel.options[i] ?? sel.appendChild(document.createElement('option')); if (o.value !== v) o.value = v; if (o.textContent !== t) o.textContent = t; });
}
const selectOf = (r: Row<string>): HTMLSelectElement => r.el.querySelector('select') as HTMLSelectElement;
const readout = (label: string): { el: HTMLElement; out: HTMLInputElement } => {
  const root = el('<label class="cv-field"><span></span><input class="cv-input" type="text" readonly tabindex="-1"></label>');
  setText(root.querySelector('span') as HTMLElement, label);
  return { el: root, out: root.querySelector('input') as HTMLInputElement };
};
const heading = (text: string): HTMLElement => { const h = el('<p class="cv-note cv-note-head"></p>'); setText(h, text); return h; };

/** Edit > Color Settings (DEV_PLAN 28.2): the working RGB, CMYK and Gray spaces from the profile list, the policy for
 *  pictures whose profile differs or is missing (and whether to ask), how conversions run (LittleCMS, intent, black
 *  point compensation, dither), and the chosen CMYK profile's total ink and black generation read from the profile.
 *  Kept in Preferences, with named presets. Every control exists from the start and keeps its place. */
export class ColorSettingsDialog extends Dialog {
  private s: ColourSettings = loadPrefs().colour;
  private saved: ColourPreset[] = [];
  private presetId = '';
  private seq = 0;
  private infoKey = '';
  private readonly presetRow: Row<string>;
  private readonly rgbRow: Row<string>;
  private readonly cmykRow: Row<string>;
  private readonly grayRow: Row<string>;
  private readonly policyRows: Record<'rgb' | 'cmyk' | 'gray', Row<string>>;
  private readonly askMismatch: Row<boolean>;
  private readonly askMissing: Row<boolean>;
  private readonly engineRow: Row<string>;
  private readonly intentRow: Row<string>;
  private readonly bpcRow: Row<boolean>;
  private readonly ditherRow: Row<boolean>;
  private readonly displayRow: Row<boolean>;
  private readonly exrRow: Row<boolean>;
  private readonly displayNote = el('<p class="cv-note"></p>');
  private readonly tac = readout('Total ink limit');
  private readonly black = readout('Black ink limit');
  private readonly generation = readout('Black generation');
  private readonly doc = el('<p class="cv-note"></p>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private readonly nameInput = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="60" placeholder="Preset name">');
  private readonly deleteBtn: HTMLButtonElement;

  constructor(private readonly engine: Engine, private readonly view: () => ColourView | null = () => null) {
    super('Color Settings', 520);
    const set = (patchIt: Partial<ColourSettings>): void => { this.s = cleanColour({ ...this.s, ...patchIt }); this.presetId = ''; this.sync(); };
    this.presetRow = selectRow('Settings', [['', 'Custom']], (v) => this.pick(v));
    this.rgbRow = selectRow('RGB', BUILT_IN_RGB, (v) => set({ rgb: v }));
    this.cmykRow = selectRow('CMYK', [['default', 'Default']], (v) => set({ cmyk: v }));
    this.grayRow = selectRow('Gray', [['id:builtin:gray-g22', 'Gray Gamma 2.2']], (v) => set({ gray: v }));
    const policy = (label: string, key: 'rgbPolicy' | 'cmykPolicy' | 'grayPolicy'): Row<string> => selectRow(label, POLICIES, (v) => set({ [key]: v as Policy }));
    this.policyRows = { rgb: policy('RGB', 'rgbPolicy'), cmyk: policy('CMYK', 'cmykPolicy'), gray: policy('Gray', 'grayPolicy') };
    this.askMismatch = checkRow('Ask when opening, profile mismatch', (v) => set({ askMismatch: v }));
    this.askMissing = checkRow('Ask when opening, no profile', (v) => set({ askMissing: v }));
    this.engineRow = selectRow('Engine', [['lcms', 'LittleCMS 2']], () => undefined);
    selectOf(this.engineRow).disabled = true;
    this.intentRow = selectRow('Intent', INTENT_CHOICES, (v) => set({ intent: v as Intent }));
    this.bpcRow = checkRow('Use Black Point Compensation', (v) => set({ bpc: v }));
    this.ditherRow = checkRow('Use Dither (8-bit/channel)', (v) => set({ dither: v }));
    this.displayRow = checkRow('Draw the canvas through the monitor profile', (v) => set({ useDisplay: v }));
    this.exrRow = checkRow('Open OpenEXR files as ACEScg', (v) => set({ exrAcescg: v }));
    const save = el<HTMLButtonElement>('<button class="cv-btn" type="button">Save Preset</button>');
    this.deleteBtn = el<HTMLButtonElement>('<button class="cv-btn" type="button">Delete Preset</button>');
    save.addEventListener('click', () => this.savePreset());
    this.deleteBtn.addEventListener('click', () => this.deletePreset());
    const manage = el('<div class="cv-field"><span></span><div class="cv-row-actions"></div></div>');
    (manage.lastElementChild as HTMLElement).append(this.nameInput, save, this.deleteBtn);
    this.body.append(this.presetRow.el, heading('Working Spaces'), this.rgbRow.el, this.cmykRow.el, this.grayRow.el,
      heading('Color Management Policies'), this.policyRows.rgb.el, this.policyRows.cmyk.el, this.policyRows.gray.el, this.askMismatch.el, this.askMissing.el, this.exrRow.el,
      heading('Conversion Options'), this.engineRow.el, this.intentRow.el, this.bpcRow.el, this.ditherRow.el,
      heading('Display'), this.displayRow.el, this.displayNote,
      heading('CMYK Profile'), this.tac.el, this.black.el, this.generation.el, this.doc, manage, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.ok());
  }

  async show(): Promise<void> {
    if (this.isOpen) return;
    const prefs = loadPrefs();
    this.s = prefs.colour;
    this.saved = prefs.colourPresets;
    this.presetId = this.matching();
    setText(this.note, '');
    await this.fill();
    this.sync();
    this.open();
    void this.view()?.detect().then(() => this.sync());
  }

  private all(): ColourPreset[] { return [...BUILTIN_COLOUR_PRESETS, ...this.saved]; }

  private matching(): string { return this.all().find((p) => JSON.stringify(p.settings) === JSON.stringify(this.s))?.id ?? ''; }

  private async fill(): Promise<void> {
    patch(selectOf(this.presetRow), [['', 'Custom'], ...this.all().map((p) => [p.id, p.name] as const)]);
    const rgb: Array<[string, string]> = [...BUILT_IN_RGB], cmyk: Array<[string, string]> = [], gray: Array<[string, string]> = [];
    let shipped = 'Default';
    try {
      const [list, def] = await Promise.all([api.colourProfiles(), api.defaultCmykProfile()]);
      for (const p of list.profiles) {
        if (p.space === 'RGB') rgb.push([`id:${p.id}`, p.name]);
        else if (p.space === 'CMYK') cmyk.push([`id:${p.id}`, p.name]);
        else if (p.space === 'GRAY') gray.push([`id:${p.id}`, p.name]);
      }
      if (def) shipped = `Default: ${def.name}`;
    } catch (err) { setText(this.note, msg(err)); }
    patch(selectOf(this.rgbRow), rgb);
    patch(selectOf(this.cmykRow), [['default', shipped], ...cmyk]);
    patch(selectOf(this.grayRow), gray.length ? gray : [['id:builtin:gray-g22', 'Gray Gamma 2.2']]);
  }

  private pick(id: string): void {
    const p = this.all().find((x) => x.id === id);
    this.presetId = p ? p.id : '';
    if (p) this.s = cleanColour(p.settings);
    this.sync();
  }

  private sync(): void {
    const s = this.s;
    this.presetRow.set(this.presetId);
    this.rgbRow.set(s.rgb); this.cmykRow.set(s.cmyk); this.grayRow.set(s.gray);
    this.policyRows.rgb.set(s.rgbPolicy); this.policyRows.cmyk.set(s.cmykPolicy); this.policyRows.gray.set(s.grayPolicy);
    this.askMismatch.set(s.askMismatch); this.askMissing.set(s.askMissing);
    this.engineRow.set('lcms'); this.intentRow.set(s.intent); this.bpcRow.set(s.bpc); this.ditherRow.set(s.dither);
    const monitor = this.view()?.display ?? null;
    this.displayRow.set(s.useDisplay);
    this.exrRow.set(s.exrAcescg);
    for (const i of this.displayRow.el.querySelectorAll('input')) i.disabled = !monitor?.icc;
    setText(this.displayNote, displayLine(monitor, s.useDisplay));
    this.deleteBtn.disabled = !this.saved.some((x) => x.id === this.presetId);
    const p = this.engine.current;
    setText(this.doc, p ? `This document: ${p.doc.profile?.name ?? (p.doc.mode === 'lab' ? 'Lab (D50)' : 'sRGB IEC61966-2.1')} · ${p.doc.depth ?? 8}-bit` : '');
    void this.info();
  }

  private async info(): Promise<void> {
    if (this.infoKey === this.s.cmyk && this.tac.out.value) return;
    this.infoKey = this.s.cmyk;
    const n = ++this.seq;
    try {
      let ref: { id: string } | null = null;
      if (this.s.cmyk.startsWith('id:')) ref = { id: this.s.cmyk.slice(3) };
      else { const def = await api.defaultCmykProfile(); ref = def ? { id: def.id } : null; }
      if (!ref) { this.show3('No CMYK profile', '', ''); return; }
      const i = await api.profileInfo(ref);
      if (n !== this.seq) return;
      this.show3(i.tac === null ? 'Not stated by this profile' : `${i.tac}%`, i.blackLimit === null ? 'Not stated by this profile' : `${i.blackLimit}%`, i.generation === null ? 'Not stated by this profile' : `${i.generation} (${i.blackAtMid}% black at 50% grey)`);
    } catch (err) { if (n === this.seq) { this.infoKey = ''; this.show3('', '', ''); } setText(this.note, msg(err)); }
  }

  private show3(tac: string, black: string, generation: string): void {
    if (this.tac.out.value !== tac) this.tac.out.value = tac;
    if (this.black.out.value !== black) this.black.out.value = black;
    if (this.generation.out.value !== generation) this.generation.out.value = generation;
  }

  private store(): void {
    const prefs = loadPrefs();
    savePrefs({ ...prefs, colour: this.s, colourPresets: this.saved, profileMismatch: mismatchPref(this.s) });
    void this.view()?.refresh();
  }

  private savePreset(): void {
    const name = this.nameInput.value.trim();
    if (!name) { toast('Name the preset first.'); this.nameInput.focus(); return; }
    if (BUILTIN_COLOUR_PRESETS.some((p) => p.name.toLowerCase() === name.toLowerCase())) { toast('That name belongs to a built-in preset.'); return; }
    const existing = this.saved.find((p) => p.name.toLowerCase() === name.toLowerCase());
    const preset: ColourPreset = { id: existing?.id ?? `user-${Date.now().toString(36)}`, name, settings: this.s, builtin: false };
    this.saved = existing ? this.saved.map((p) => (p.id === existing.id ? preset : p)) : [...this.saved, preset];
    this.store();
    patch(selectOf(this.presetRow), [['', 'Custom'], ...this.all().map((p) => [p.id, p.name] as const)]);
    this.presetId = preset.id;
    this.nameInput.value = '';
    this.sync();
    toast(`Saved the preset "${name}".`);
  }

  private deletePreset(): void {
    const p = this.saved.find((x) => x.id === this.presetId);
    if (!p) return;
    this.saved = this.saved.filter((x) => x.id !== p.id);
    this.store();
    patch(selectOf(this.presetRow), [['', 'Custom'], ...this.all().map((q) => [q.id, q.name] as const)]);
    this.presetId = '';
    this.sync();
  }

  private ok(): void {
    this.store();
    this.close();
    toast('Color settings saved.');
  }
}

/** Registers Edit > Color Settings as the command `colour.settings` (Shift+Mod+K) and returns the
 *  dialogs, so the opening path can show the missing-profile prompt when the settings ask for it. */
export function installColorSettings(commands: Commands, engine: Engine, view: () => ColourView | null = () => null): { settings: ColorSettingsDialog; missing: MissingProfileDialog } {
  const settings = new ColorSettingsDialog(engine, view), missing = new MissingProfileDialog();
  commands.add({ id: 'colour.settings', label: 'Color Settings...', keys: ['Shift+Mod+K'], run: () => void settings.show() });
  return { settings, missing };
}
