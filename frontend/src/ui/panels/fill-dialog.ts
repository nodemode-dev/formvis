import { BLEND_MODES, allPatterns, canvasBlend, type BlendMode, type Engine, type RGB } from '../../engine';
import { Dialog } from '../dialogs';
import { toast } from '../toast';
import { checkRow, colorRow, selectRow, sliderRow, type Row } from './controls';

type Contents = 'fg' | 'bg' | 'color' | 'black' | 'gray' | 'white' | 'pattern' | 'contentAware' | 'history';
const CONTENTS: ReadonlyArray<readonly [Contents, string]> = [
  ['fg', 'Foreground Color'], ['bg', 'Background Color'], ['color', 'Color...'], ['contentAware', 'Content-Aware'], ['pattern', 'Pattern'], ['history', 'History'], ['black', 'Black'], ['gray', '50% Gray'], ['white', 'White'],
];

/** Edit > Fill (Shift+F5), as Photoshop lays it out: Contents, then Mode, Opacity and Preserve Transparency. Every
 *  row exists from the start; the colour and pattern rows are disabled, not hidden, when the contents do not use
 *  them, so the dialog keeps one size. Content-Aware hands over to Content-Aware Fill, which has no blending. */
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

  constructor(private readonly engine: Engine, private readonly contentAware: () => void) {
    super('Fill', 380);
    this.contentsRow = selectRow('Contents', CONTENTS, (v) => { this.contents = v as Contents; this.sync(); });
    this.colorRowEl = colorRow('Color', (hex) => { this.color = { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }; });
    this.patternRow = selectRow('Pattern', allPatterns().map((p) => [p.id, p.name] as const), (v) => { this.patternId = v; });
    this.modeRow = selectRow('Mode', BLEND_MODES.filter((m) => canvasBlend(m.id)).map((m) => [m.id, m.label] as const), (v) => { this.blend = v as BlendMode; });
    this.opacityRow = sliderRow('Opacity (%)', 1, 100, 1, (v) => { this.opacity = v; });
    this.preserveRow = checkRow('Preserve Transparency', (v) => { this.preserve = v; });
    this.body.append(this.contentsRow.el, this.colorRowEl.el, this.patternRow.el, this.modeRow.el, this.opacityRow.el, this.preserveRow.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(): void {
    if (this.isOpen) return;
    if (!this.engine.current?.activeLayer) { toast('Select a layer first.'); return; }
    if (!this.patternId) this.patternId = allPatterns()[0]?.id ?? '';
    this.contentsRow.set(this.contents);
    this.patternRow.set(this.patternId);
    this.modeRow.set(this.blend);
    this.opacityRow.set(this.opacity);
    this.preserveRow.set(this.preserve);
    this.sync();
    this.open();
  }

  private sync(): void {
    const off = (row: Row<unknown>, disabled: boolean): void => { row.el.classList.toggle('is-off', disabled); for (const i of row.el.querySelectorAll('input, select')) (i as HTMLInputElement).disabled = disabled; };
    const ca = this.contents === 'contentAware';
    off(this.colorRowEl as Row<unknown>, this.contents !== 'color');
    off(this.patternRow as Row<unknown>, this.contents !== 'pattern');
    off(this.modeRow as Row<unknown>, ca);
    off(this.opacityRow as Row<unknown>, ca);
    off(this.preserveRow as Row<unknown>, ca);
  }

  private apply(): void {
    const e = this.engine, k = this.contents;
    this.close();
    if (k === 'contentAware') { this.contentAware(); return; }
    const color: RGB | null = k === 'fg' ? e.fg : k === 'bg' ? e.bg : k === 'color' ? this.color : k === 'black' ? { r: 0, g: 0, b: 0 } : k === 'gray' ? { r: 128, g: 128, b: 128 } : k === 'white' ? { r: 255, g: 255, b: 255 } : null;
    e.fillWith(k === 'history' ? { history: true } : color ? { color: { ...color } } : { patternId: this.patternId }, this.blend, this.opacity / 100, this.preserve);
  }
}
