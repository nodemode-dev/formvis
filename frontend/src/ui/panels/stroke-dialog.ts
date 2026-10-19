import { BLEND_MODES, canvasBlend, type BlendMode, type Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { checkRow, colorRow, numberRow, selectRow, sliderRow } from './controls';

type Location = 'inside' | 'center' | 'outside';
const hex = (c: { r: number; g: number; b: number }): string => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Edit > Stroke (1.65.7): Width and Color, Location (Inside, Center, Outside), then Mode,
 *  Opacity and Preserve Transparency. The colour starts at the foreground's; the rest are kept for next time. OK
 *  strokes the selection's edge, or with no selection the layer's. */
export class StrokeDialog extends Dialog {
  private width = 1;
  private color = '#000000';
  private location: Location = 'center';
  private blend: BlendMode = 'normal';
  private opacity = 100;
  private preserve = false;
  private readonly widthRow = numberRow('Width (px)', 1, 250, 1, (v) => { this.width = v; });
  private readonly colorRowEl = colorRow('Color', (v) => { this.color = v; });
  private readonly locationRow = selectRow('Location', [['inside', 'Inside'], ['center', 'Center'], ['outside', 'Outside']], (v) => { this.location = v as Location; });
  private readonly modeRow = selectRow('Mode', BLEND_MODES.filter((m) => canvasBlend(m.id)).map((m) => [m.id, m.label] as const), (v) => { this.blend = v as BlendMode; });
  private readonly opacityRow = sliderRow('Opacity (%)', 1, 100, 1, (v) => { this.opacity = v; });
  private readonly preserveRow = checkRow('Preserve Transparency', (v) => { this.preserve = v; });

  constructor(private readonly engine: Engine) {
    super('Stroke', 360);
    this.body.append(this.widthRow.el, this.colorRowEl.el, this.locationRow.el, this.modeRow.el, this.opacityRow.el, this.preserveRow.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.widthRow.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.apply(); } });
    this.remember([this.colorRowEl.el.querySelector('input') as HTMLInputElement]);   // the colour starts at the foreground's
  }

  show(): void {
    const p = this.engine.current, l = p?.activeLayer;
    if (this.isOpen || !p) return;
    if (!l || l.isGroup || l.adjustment) { this.engine.notice('Select a pixel layer first.'); return; }
    if (!p.selection && !l.raster) { this.engine.notice('Make a selection first: Edit > Stroke strokes its edge.'); return; }
    this.color = hex(this.engine.fg);
    this.widthRow.set(this.width); this.colorRowEl.set(this.color); this.locationRow.set(this.location);
    this.modeRow.set(this.blend); this.opacityRow.set(this.opacity); this.preserveRow.set(this.preserve);
    this.open(this.widthRow.input);
    this.widthRow.input.select();
  }

  private apply(): void {
    const w = Number(this.widthRow.input.value);
    if (!(w >= 1 && w <= 250)) { this.engine.notice('Enter a width from 1 to 250 pixels.'); return; }
    this.width = Math.round(w);
    const c = this.color, color = { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) };
    this.close();
    this.engine.strokeSelection({ width: this.width, color, location: this.location, blend: this.blend, opacity: this.opacity / 100, preserve: this.preserve });
  }
}
