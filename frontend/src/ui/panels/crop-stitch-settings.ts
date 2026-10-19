import { cleanCropStitch, type CropStitch } from '../../engine/crop-stitch';
import { cropPresets, loadCropStitch, removeCropPreset, saveCropPreset, saveCropStitch } from '../../io/crop-stitch-run';
import { el, patchList, setText } from '../dom';

/** The Crop and stitch settings of the generation dialogs: on or off, padding around the selection, the size the crop is
 *  run at, the multiple it is rounded to, the feather of the stitched edge, and presets (shipped and your own). Built
 *  once; kept on this device as they change (the dialog's own memory leaves them alone). */
export class CropStitchSettings {
  readonly el = el(`<details class="cv-cs" data-forget>
    <summary>Crop and stitch</summary>
    <label class="cv-dialog-row"><span>Use crop and stitch</span><input type="checkbox" data-f="enabled" aria-label="Use crop and stitch"></label>
    <label class="cv-dialog-row"><span>Padding (px)</span><input class="cv-input" type="number" min="0" max="2048" step="1" data-f="padding" aria-label="Crop padding"></label>
    <label class="cv-dialog-row"><span>Context factor</span><input class="cv-input" type="number" min="1" max="4" step="0.05" data-f="expand" aria-label="Crop context factor" title="1 crops the selection's box; 1.5 takes half as much again around it"></label>
    <label class="cv-dialog-row"><span>Mask grow (px)</span><input class="cv-input" type="number" min="0" max="256" step="1" data-f="grow" aria-label="Mask grow" title="Spreads the selection outwards before the run, so the fill reaches past its edge"></label>
    <label class="cv-dialog-row"><span>Target size (px)</span><input class="cv-input" type="number" min="64" max="4096" step="1" data-f="target" aria-label="Crop target size"></label>
    <label class="cv-dialog-row"><span>Multiple of</span><input class="cv-input" type="number" min="1" max="256" step="1" data-f="multiple" aria-label="Crop multiple of"></label>
    <label class="cv-dialog-row"><span>Feather (px)</span><input class="cv-input" type="number" min="0" max="256" step="1" data-f="feather" aria-label="Stitch feather"></label>
    <label class="cv-dialog-row"><span>Preset</span><select class="cv-input" aria-label="Crop and stitch preset"></select></label>
    <div class="cv-dialog-row"><input class="cv-input" type="text" maxlength="40" placeholder="Name for a new preset" aria-label="Preset name"><button type="button" class="cv-btn cv-btn-ghost" data-act="save">Save preset</button><button type="button" class="cv-btn cv-btn-ghost" data-act="delete">Delete</button></div>
    <p class="cv-note cv-cs-note" role="status"></p>
  </details>`);
  private readonly fields: Record<'enabled' | 'padding' | 'target' | 'multiple' | 'feather' | 'expand' | 'grow', HTMLInputElement>;
  private readonly preset = this.el.querySelector('select') as HTMLSelectElement;
  private readonly name = this.el.querySelector('input[type=text]') as HTMLInputElement;
  private readonly del = this.el.querySelector('[data-act=delete]') as HTMLButtonElement;
  private readonly note = this.el.querySelector('.cv-cs-note') as HTMLElement;

  constructor() {
    const f = (k: string): HTMLInputElement => this.el.querySelector(`[data-f=${k}]`) as HTMLInputElement;
    this.fields = { enabled: f('enabled'), padding: f('padding'), target: f('target'), multiple: f('multiple'), feather: f('feather'), expand: f('expand'), grow: f('grow') };
    this.paintPresets();
    this.load();
    this.el.addEventListener('input', (e) => { if (e.target instanceof HTMLInputElement && e.target.dataset.f) this.changed(); });
    this.el.addEventListener('change', (e) => { if (e.target instanceof HTMLInputElement && e.target.dataset.f) this.changed(); });
    this.preset.addEventListener('change', () => this.applyPreset());
    this.el.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'save') this.savePreset();
      else if (act === 'delete') this.deletePreset();
    });
  }

  /** The settings as the fields hold them, each kept inside its range. */
  value(): CropStitch {
    const n = (k: 'padding' | 'target' | 'multiple' | 'feather' | 'expand' | 'grow'): number => Number(this.fields[k].value);
    return cleanCropStitch({ enabled: this.fields.enabled.checked, padding: n('padding'), target: n('target'), multiple: n('multiple'), feather: n('feather'), expand: n('expand'), grow: n('grow') });
  }

  /** Puts the kept settings in the fields. */
  load(): void {
    const s = loadCropStitch();
    this.fields.enabled.checked = s.enabled;
    for (const k of ['padding', 'target', 'multiple', 'feather', 'expand', 'grow'] as const) this.fields[k].value = String(s[k]);
    this.matchPreset();
  }

  private changed(): void {
    saveCropStitch(this.value());
    this.matchPreset();
  }

  private paintPresets(): void {
    const items = [{ name: '', shipped: true, settings: null }, ...cropPresets()] as Array<{ name: string; shipped: boolean; settings: unknown }>;
    patchList(this.preset, items, {
      key: (p) => p.name || '~custom',
      create: (p) => { const o = document.createElement('option'); o.value = p.name; setText(o, p.name || 'Custom'); return o; },
      update: (o, p) => setText(o, p.name ? (p.shipped ? p.name : `${p.name} (yours)`) : 'Custom'),
    });
  }

  /** Shows the preset the fields match, or Custom. */
  private matchPreset(): void {
    const v = this.value();
    const hit = cropPresets().find((p) => p.settings.padding === v.padding && p.settings.target === v.target && p.settings.multiple === v.multiple && p.settings.feather === v.feather && p.settings.expand === v.expand && p.settings.grow === v.grow);
    if (this.preset.value !== (hit?.name ?? '')) this.preset.value = hit?.name ?? '';
    this.del.disabled = !hit || hit.shipped;
  }

  private applyPreset(): void {
    const p = cropPresets().find((x) => x.name === this.preset.value);
    if (!p) return;
    for (const k of ['padding', 'target', 'multiple', 'feather', 'expand', 'grow'] as const) this.fields[k].value = String(p.settings[k]);
    this.changed();
    setText(this.note, `${p.name}: applied.`);
  }

  private savePreset(): void {
    const name = this.name.value.trim();
    if (!name) { setText(this.note, 'Type a name for the preset first.'); return; }
    if (!saveCropPreset(name, this.value())) { setText(this.note, 'That name is taken by a shipped preset, or the preset could not be kept.'); return; }
    this.name.value = '';
    this.paintPresets();
    this.preset.value = name;
    this.matchPreset();
    setText(this.note, `${name}: kept.`);
  }

  private deletePreset(): void {
    const p = cropPresets().find((x) => x.name === this.preset.value);
    if (!p || p.shipped) return;
    removeCropPreset(p.name);
    this.paintPresets();
    this.matchPreset();
    setText(this.note, `${p.name}: removed.`);
  }
}
