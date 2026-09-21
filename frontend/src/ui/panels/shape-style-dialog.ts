import type { Engine, RGB } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setStyleVar, setText } from '../dom';

const css = (c: RGB): string => `rgb(${c.r}, ${c.g}, ${c.b})`;

/** Layer > Shape Fill and Stroke: a shape layer's fill colour or none, and a stroke centred on its outline, with a
 *  colour and width, or none. Colours come from the foreground colour. */
export class ShapeStyleDialog extends Dialog {
  private readonly fillMode = el<HTMLSelectElement>('<select class="cv-input"><option value="color">Colour</option><option value="none">None</option></select>');
  private readonly strokeMode = el<HTMLSelectElement>('<select class="cv-input"><option value="none">None</option><option value="color">Colour</option></select>');
  private readonly width = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="1000" step="1" value="4">');
  private readonly fillSwatch = el('<span class="cv-shape-swatch" aria-hidden="true"></span>');
  private readonly strokeSwatch = el('<span class="cv-shape-swatch" aria-hidden="true"></span>');
  private readonly note = el('<p class="cv-note"></p>');
  private fill: RGB = { r: 0, g: 0, b: 0 };
  private stroke: RGB = { r: 0, g: 0, b: 0 };

  constructor(private readonly engine: Engine) {
    super('Shape Fill and Stroke', 400);
    const row = (select: HTMLElement, swatch: HTMLElement, use: () => void): HTMLElement => {
      const r = el('<div class="cv-shape-row"></div>'), b = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button">Use foreground</button>');
      b.addEventListener('click', use);
      r.append(select, swatch, b);
      return r;
    };
    this.field('Fill', row(this.fillMode, this.fillSwatch, () => { this.fill = { ...this.engine.fg }; this.fillMode.value = 'color'; this.paint(); }));
    this.field('Stroke', row(this.strokeMode, this.strokeSwatch, () => { this.stroke = { ...this.engine.fg }; this.strokeMode.value = 'color'; this.paint(); }));
    this.field('Stroke width', this.width);
    this.body.appendChild(this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.fillMode.addEventListener('change', () => this.paint());
    this.strokeMode.addEventListener('change', () => this.paint());
  }

  show(): void {
    const v = this.engine.current?.activeLayer?.vector;
    if (!v) { this.engine.notice('Select a shape layer first.'); return; }
    this.fill = v.fill ?? { ...this.engine.fg };
    this.stroke = v.stroke?.color ?? { ...this.engine.fg };
    this.fillMode.value = v.fill ? 'color' : 'none';
    this.strokeMode.value = v.stroke ? 'color' : 'none';
    this.width.value = String(v.stroke?.width ?? 4);
    this.paint();
    this.open();
  }

  private paint(): void {
    setStyleVar(this.fillSwatch, '--swatch', this.fillMode.value === 'color' ? css(this.fill) : 'transparent');
    setStyleVar(this.strokeSwatch, '--swatch', this.strokeMode.value === 'color' ? css(this.stroke) : 'transparent');
    this.width.disabled = this.strokeMode.value !== 'color';
    setText(this.note, 'The stroke is centred on the outline. Use foreground takes the current foreground colour.');
  }

  private apply(): void {
    const w = Math.min(1000, Math.max(1, Math.round(Number(this.width.value) || 1)));
    const fill = this.fillMode.value === 'color' ? { ...this.fill } : null, stroke = this.strokeMode.value === 'color' ? { color: { ...this.stroke }, width: w } : null;
    if (!fill && !stroke) { setText(this.note, 'A shape needs a fill, a stroke or both.'); return; }
    this.close();
    this.engine.setShapeStyle({ fill, stroke });
  }
}
