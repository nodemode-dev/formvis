import type { Engine, RGB, ShapeGradient } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setHidden, setStyleVar, setText } from '../dom';

const css = (c: RGB): string => `rgb(${c.r}, ${c.g}, ${c.b})`;

/** Layer > Shape Fill and Stroke: a shape layer's fill colour or none, and a stroke centred on its outline, with a
 *  colour and width, or none. Colours come from the foreground colour. */
export class ShapeStyleDialog extends Dialog {
  private readonly fillMode = el<HTMLSelectElement>('<select class="cv-input"><option value="color">Colour</option><option value="none">None</option></select>');
  private readonly strokeMode = el<HTMLSelectElement>('<select class="cv-input"><option value="none">None</option><option value="color">Colour</option></select>');
  private readonly width = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="1000" step="1" value="4">');
  private readonly dash = el<HTMLSelectElement>('<select class="cv-input"><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select>');
  private readonly align = el<HTMLSelectElement>('<select class="cv-input"><option value="inside">Inside</option><option value="center">Center</option><option value="outside">Outside</option></select>');
  private readonly fillSwatch = el('<span class="cv-shape-swatch" aria-hidden="true"></span>');
  private readonly strokeSwatch = el('<span class="cv-shape-swatch" aria-hidden="true"></span>');
  private readonly gradMode = el<HTMLSelectElement>('<select class="cv-input"><option value="none">None (solid)</option><option value="linear">Linear</option><option value="radial">Radial</option><option value="angle">Angle</option></select>');
  private readonly gradAngle = el<HTMLInputElement>('<input class="cv-input" type="number" min="-180" max="180" step="1" value="0">');
  private readonly gradSwatch = el('<span class="cv-shape-swatch" aria-hidden="true"></span>');
  private readonly cap = el<HTMLSelectElement>('<select class="cv-input"><option value="round">Round</option><option value="butt">Butt</option><option value="square">Square</option></select>');
  private readonly join = el<HTMLSelectElement>('<select class="cv-input"><option value="round">Round</option><option value="miter">Miter</option><option value="bevel">Bevel</option></select>');
  private readonly miter = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="10" step="0.5" value="4">');
  private readonly dashes = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="false" placeholder="4 2 (in stroke widths; empty uses the type)">');
  private readonly dashOffset = el<HTMLInputElement>('<input class="cv-input" type="number" min="-1000" max="1000" step="0.5" value="0">');
  private readonly strokeOpacity = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="100" step="1" value="100">');
  private readonly strokeGrad = el<HTMLSelectElement>('<select class="cv-input"><option value="none">None (solid)</option><option value="linear">Linear</option><option value="radial">Radial</option><option value="angle">Angle</option></select>');
  private readonly sides = el<HTMLInputElement>('<input class="cv-input" type="number" min="3" max="100" step="1" value="5">');
  private readonly inset = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="99" step="1" value="50">');
  private readonly radius = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="15000" step="1" value="0">');
  private liveRows: HTMLElement[] = [];
  private readonly note = el('<p class="cv-note"></p>');
  private fill: RGB = { r: 0, g: 0, b: 0 };
  private stroke: RGB = { r: 0, g: 0, b: 0 };
  private gradEnd: RGB = { r: 255, g: 255, b: 255 };
  private kept: ShapeGradient['stops'] | null = null;

  constructor(private readonly engine: Engine) {
    super('Shape Fill and Stroke', 400);
    const row = (select: HTMLElement, swatch: HTMLElement, use: () => void): HTMLElement => {
      const r = el('<div class="cv-shape-row"></div>'), b = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button">Use foreground</button>');
      b.addEventListener('click', use);
      r.append(select, swatch, b);
      return r;
    };
    this.liveRows = [this.field('Sides', this.sides), this.field('Star inset %', this.inset), this.field('Corner radius', this.radius)];
    this.field('Fill', row(this.fillMode, this.fillSwatch, () => { this.fill = { ...this.engine.fg }; this.fillMode.value = 'color'; this.paint(); }));
    this.field('Stroke', row(this.strokeMode, this.strokeSwatch, () => { this.stroke = { ...this.engine.fg }; this.strokeMode.value = 'color'; this.paint(); }));
    this.field('Stroke width', this.width);
    this.field('Stroke type', this.dash);
    this.field('Stroke align', this.align);
    this.field('Stroke caps', this.cap);
    this.field('Stroke corners', this.join);
    this.field('Miter limit', this.miter);
    this.field('Dash pattern', this.dashes);
    this.field('Dash offset', this.dashOffset);
    this.field('Stroke opacity %', this.strokeOpacity);
    this.field('Stroke gradient', this.strokeGrad);
    this.strokeGrad.addEventListener('change', () => this.paint());
    this.field('Gradient fill', this.gradMode);
    this.field('Gradient angle', this.gradAngle);
    const endRow = el('<div class="cv-shape-row"></div>'), endBtn = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button">Use background</button>');
    endBtn.addEventListener('click', () => { this.gradEnd = { ...this.engine.bg }; this.kept = null; this.paint(); });
    endRow.append(this.gradSwatch, endBtn);
    this.field('Gradient end', endRow);
    this.body.appendChild(this.note);
    this.gradMode.addEventListener('change', () => this.paint());
    this.join.addEventListener('change', () => this.paint());
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.fillMode.addEventListener('change', () => this.paint());
    this.strokeMode.addEventListener('change', () => this.paint());
  }

  show(): void {
    const v = this.engine.current?.activeLayer?.vector;
    if (!v) { this.engine.notice('Select a shape layer first.'); return; }
    const lv = v.live;
    this.liveRows.forEach((r, i) => setHidden(r, !lv || (i === 1 && lv.kind !== 'star')));
    if (lv) { this.sides.value = String(lv.sides); this.inset.value = String(lv.inset); this.radius.value = String(lv.radius); }
    this.sides.disabled = lv?.kind === 'triangle';
    this.fill = v.fill ?? { ...this.engine.fg };
    this.stroke = v.stroke?.color ?? { ...this.engine.fg };
    this.fillMode.value = v.fill ? 'color' : 'none';
    this.strokeMode.value = v.stroke ? 'color' : 'none';
    this.width.value = String(v.stroke?.width ?? 4);
    this.dash.value = v.stroke?.dash ?? 'solid';
    this.align.value = v.stroke?.align ?? 'center';
    this.cap.value = v.stroke?.cap ?? 'round';
    this.join.value = v.stroke?.join ?? 'round';
    this.miter.value = String(v.stroke?.miter ?? 4);
    this.dashes.value = (v.stroke?.dashes ?? []).join(' ');
    this.dashOffset.value = String(v.stroke?.dashOffset ?? 0);
    this.strokeOpacity.value = String(Math.round((v.stroke?.opacity ?? 1) * 100));
    const g = v.gradient, sg = v.stroke?.gradient;
    this.strokeGrad.value = sg ? sg.type : 'none';
    this.gradMode.value = g ? g.type : 'none';
    this.gradAngle.value = String(g?.angle ?? 0);
    this.gradEnd = g ? { ...g.stops[g.stops.length - 1].color } : sg ? { ...sg.stops[sg.stops.length - 1].color } : { ...this.engine.bg };
    if (g) this.fill = { ...g.stops[0].color };
    this.kept = g && g.stops.length > 2 ? g.stops.map((s) => ({ ...s, color: { ...s.color } })) : null;
    this.paint();
    this.open();
  }

  private paint(): void {
    setStyleVar(this.fillSwatch, '--swatch', this.fillMode.value === 'color' ? css(this.fill) : 'transparent');
    setStyleVar(this.strokeSwatch, '--swatch', this.strokeMode.value === 'color' ? css(this.stroke) : 'transparent');
    setStyleVar(this.gradSwatch, '--swatch', css(this.gradEnd));
    this.width.disabled = this.strokeMode.value !== 'color';
    this.dash.disabled = this.width.disabled;
    this.align.disabled = this.width.disabled;
    this.cap.disabled = this.width.disabled;
    this.join.disabled = this.width.disabled;
    this.miter.disabled = this.width.disabled || this.join.value !== 'miter';
    this.dashes.disabled = this.width.disabled;
    this.dashOffset.disabled = this.width.disabled;
    this.strokeOpacity.disabled = this.width.disabled;
    this.strokeGrad.disabled = this.width.disabled;
    this.gradAngle.disabled = (this.fillMode.value !== 'color' || this.gradMode.value === 'none') && (this.width.disabled || this.strokeGrad.value === 'none');
    this.gradMode.disabled = this.fillMode.value !== 'color';
    setText(this.note, 'Use foreground takes the current foreground colour.');
  }

  private dashExtras(): { dashes?: number[]; dashOffset?: number; opacity?: number } {
    const d = this.dashes.value.split(/[\s,]+/).filter(Boolean).map(Number).slice(0, 16), off = Number(this.dashOffset.value) || 0, op = Math.min(100, Math.max(0, Number(this.strokeOpacity.value))) / 100;
    return { ...(d.length && d.every((n) => Number.isFinite(n) && n >= 0 && n <= 1000) && d.some((n) => n > 0) ? { dashes: d } : {}), ...(off ? { dashOffset: Math.max(-1000, Math.min(1000, off)) } : {}), ...(op < 1 ? { opacity: op } : {}) };
  }

  private apply(): void {
    const w = Math.min(1000, Math.max(1, Math.round(Number(this.width.value) || 1)));
    const fill = this.fillMode.value === 'color' ? { ...this.fill } : null, stroke = this.strokeMode.value === 'color' ? { color: { ...this.stroke }, width: w, dash: this.dash.value as 'solid' | 'dashed' | 'dotted', align: this.align.value as 'inside' | 'center' | 'outside', cap: this.cap.value as 'butt' | 'round' | 'square', join: this.join.value as 'miter' | 'round' | 'bevel', miter: Math.min(10, Math.max(1, Number(this.miter.value) || 4)), ...this.dashExtras(), ...(this.strokeGrad.value !== 'none' ? { gradient: { type: this.strokeGrad.value as ShapeGradient['type'], angle: Math.min(180, Math.max(-180, Number(this.gradAngle.value) || 0)), stops: [{ at: 0, color: { ...this.stroke } }, { at: 1, color: { ...this.gradEnd } }] } } : {}) } : null;
    if (!fill && !stroke) { setText(this.note, 'A shape needs a fill, a stroke or both.'); return; }
    const style: { fill: RGB | null; stroke: typeof stroke; gradient?: ShapeGradient } = { fill, stroke };
    if (fill && this.gradMode.value !== 'none') style.gradient = { type: this.gradMode.value as ShapeGradient['type'], angle: Math.min(180, Math.max(-180, Number(this.gradAngle.value) || 0)), stops: this.kept ? this.kept.map((s, i) => (i === 0 ? { ...s, color: { ...fill } } : s)) : [{ at: 0, color: { ...fill } }, { at: 1, color: { ...this.gradEnd } }] };
    this.close();
    const layer = this.engine.current?.activeLayer;
    if (layer?.vector?.live) this.engine.setLiveShape(layer.id, { sides: Number(this.sides.value), inset: Number(this.inset.value), radius: Number(this.radius.value) || 0 });
    this.engine.setShapeStyle(style);
  }
}
