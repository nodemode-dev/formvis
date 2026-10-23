import { BLEND_MODES, allPatterns, type BlendMode, type Engine, type RGB } from '../../engine';
import { FILL_DEFAULTS } from '../../engine/retouch';
import { Dialog } from '../dialogs';
import { setHidden } from '../dom';
import { toast } from '../toast';
import { checkRow, colorRow, selectRow, sliderRow, type Row } from './controls';

type Contents = 'fg' | 'bg' | 'color' | 'black' | 'gray' | 'white' | 'pattern' | 'contentAware' | 'history';
const CONTENTS: ReadonlyArray<readonly [Contents, string]> = [
  ['fg', 'Foreground Color'], ['bg', 'Background Color'], ['color', 'Color...'], ['contentAware', 'Content-Aware'], ['pattern', 'Pattern'], ['history', 'History'], ['black', 'Black'], ['gray', '50% Gray'], ['white', 'White'],
];

const CHANNELS: ReadonlyArray<readonly [string, string, readonly [boolean, boolean, boolean] | null]> = [
  ['all', 'All Channels', null], ['r', 'Red', [true, false, false]], ['g', 'Green', [false, true, false]], ['b', 'Blue', [false, false, true]],
  ['rg', 'Red and Green', [true, true, false]], ['rb', 'Red and Blue', [true, false, true]], ['gb', 'Green and Blue', [false, true, true]],
];

/** Edit > Fill (Shift+F5): Contents, then Mode (all 27 modes), Opacity, Preserve Transparency and the Channels filled.
 *  Every row exists from the start; the colour, pattern and adaptation rows are disabled, not hidden, when the contents
 *  do not use them, so the dialog keeps one size. Content-Aware fills the selection in place with the chosen Color
 *  Adaptation; Edit > Selection-Aware Fill opens the workspace. */
export class FillDialog extends Dialog {
  private contents: Contents = 'fg';
  private color: RGB = { r: 255, g: 0, b: 0 };
  private patternId = '';
  private blend: BlendMode = 'normal';
  private opacity = 100;
  private preserve = false;
  private readonly contentsRow: Row<string>;
  private readonly colorRowEl: Row<string>;
  private readonly patternRow: Row<string>;
  private readonly modeRow: Row<string>;
  private readonly opacityRow: Row<number>;
  private readonly preserveRow: Row<boolean>;
  private patternScale = 100;
  private patternAngle = 0;
  private readonly scaleRow: Row<number>;
  private readonly angleRow: Row<number>;
  private adapt = 1;
  private channels = 'all';
  private readonly adaptRow: Row<string>;
  private readonly channelRow: Row<string>;
  /** Fill Path: the same dialog with the Rendering settings (Feather Radius, Anti-aliased) shown. */
  private mode: 'fill' | 'path' = 'fill';
  private feather = 0;
  private antialias = true;
  private readonly featherRow: Row<number>;
  private readonly antialiasRow: Row<boolean>;

  constructor(private readonly engine: Engine) {
    super('Fill', 380);
    this.contentsRow = selectRow('Contents', CONTENTS, (v) => { this.contents = v as Contents; this.sync(); });
    this.colorRowEl = colorRow('Color', (hex) => { this.color = { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }; });
    this.patternRow = selectRow('Pattern', allPatterns().map((p) => [p.id, p.name] as const), (v) => { this.patternId = v; });
    this.scaleRow = sliderRow('Pattern scale (%)', 10, 500, 5, (v) => { this.patternScale = v; });
    this.angleRow = sliderRow('Pattern angle', -180, 180, 1, (v) => { this.patternAngle = v; });
    this.modeRow = selectRow('Mode', BLEND_MODES.map((m) => [m.id, m.label] as const), (v) => { this.blend = v as BlendMode; });
    this.adaptRow = selectRow('Color Adaptation', [['0', 'None'], ['1', 'Default'], ['2', 'High'], ['3', 'Very High']], (v) => { this.adapt = Number(v); });
    this.channelRow = selectRow('Channels', CHANNELS.map(([id, label]) => [id, label] as const), (v) => { this.channels = v; });
    this.opacityRow = sliderRow('Opacity (%)', 1, 100, 1, (v) => { this.opacity = v; });
    this.preserveRow = checkRow('Preserve Transparency', (v) => { this.preserve = v; });
    this.featherRow = sliderRow('Feather Radius (px)', 0, 250, 0.5, (v) => { this.feather = v; });
    this.antialiasRow = checkRow('Anti-aliased', (v) => { this.antialias = v; });
    this.body.append(this.contentsRow.el, this.colorRowEl.el, this.patternRow.el, this.scaleRow.el, this.angleRow.el, this.adaptRow.el, this.modeRow.el, this.opacityRow.el, this.preserveRow.el, this.channelRow.el, this.featherRow.el, this.antialiasRow.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.remember();
  }

  /** Edit > Fill, or with `path` the Paths panel's Fill Path, which adds Feather Radius and Anti-aliased. */
  show(mode: 'fill' | 'path' = 'fill'): void {
    if (this.isOpen) return;
    if (!this.engine.current?.activeLayer) { toast('Select a layer first.'); return; }
    if (mode === 'path' && !this.engine.workPath) { toast('Draw a path with the Pen tool first.'); return; }
    this.mode = mode;
    this.setTitle(mode === 'path' ? 'Fill Path' : 'Fill');
    // Content-Aware works on the selection, not on a path.
    if (mode === 'path' && this.contents === 'contentAware') this.contents = 'fg';
    if (!this.patternId) this.patternId = allPatterns()[0]?.id ?? '';
    this.contentsRow.set(this.contents);
    this.patternRow.set(this.patternId);
    this.scaleRow.set(this.patternScale);
    this.angleRow.set(this.patternAngle);
    this.adaptRow.set(String(this.adapt));
    this.channelRow.set(this.channels);
    this.modeRow.set(this.blend);
    this.opacityRow.set(this.opacity);
    this.preserveRow.set(this.preserve);
    this.featherRow.set(this.feather);
    this.antialiasRow.set(this.antialias);
    this.sync();
    this.open();
  }

  private sync(): void {
    const off = (row: Row<unknown>, disabled: boolean): void => { row.el.classList.toggle('is-off', disabled); for (const i of row.el.querySelectorAll('input, select')) (i as HTMLInputElement).disabled = disabled; };
    const ca = this.contents === 'contentAware', path = this.mode === 'path';
    off(this.colorRowEl as Row<unknown>, this.contents !== 'color');
    off(this.patternRow as Row<unknown>, this.contents !== 'pattern');
    off(this.scaleRow as Row<unknown>, this.contents !== 'pattern');
    off(this.angleRow as Row<unknown>, this.contents !== 'pattern');
    off(this.adaptRow as Row<unknown>, !ca);
    off(this.modeRow as Row<unknown>, ca);
    off(this.opacityRow as Row<unknown>, ca);
    off(this.preserveRow as Row<unknown>, ca);
    const doc = this.engine.current?.doc;
    off(this.channelRow as Row<unknown>, ca || !!doc && ((doc.mode ?? 'rgb') !== 'rgb' || (doc.depth ?? 8) !== 8));
    setHidden(this.featherRow.el, !path);
    setHidden(this.antialiasRow.el, !path);
    const caOption = this.contentsRow.el.querySelector<HTMLOptionElement>('option[value="contentAware"]');
    if (caOption && caOption.disabled !== path) caOption.disabled = path;
  }

  private apply(): void {
    const e = this.engine, k = this.contents;
    this.close();
    if (k === 'contentAware') { e.contentAwareFillWith(null, 'current', { ...FILL_DEFAULTS, color: this.adapt }); return; }
    const color: RGB | null = k === 'fg' ? e.fg : k === 'bg' ? e.bg : k === 'color' ? this.color : k === 'black' ? { r: 0, g: 0, b: 0 } : k === 'gray' ? { r: 128, g: 128, b: 128 } : k === 'white' ? { r: 255, g: 255, b: 255 } : null;
    const contents = k === 'history' ? { history: true as const } : color ? { color: { ...color } } : { patternId: this.patternId };
    const tile = { patternScale: this.patternScale, patternAngle: this.patternAngle };
    const only = CHANNELS.find(([id]) => id === this.channels)?.[2] ?? null, kept = e.rgbTarget;
    if (only && !this.channelRow.el.classList.contains('is-off')) e.rgbTarget = [...only];
    try {
      if (this.mode === 'path') e.fillPathWith(contents, this.blend, this.opacity / 100, this.preserve, this.feather, this.antialias, tile);
      else e.fillWith(contents, this.blend, this.opacity / 100, this.preserve, tile);
    } finally { e.rgbTarget = kept; }
  }
}
