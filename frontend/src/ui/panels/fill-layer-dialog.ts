import type { Engine, RGB } from '../../engine';
import { GRADIENT_TYPES, allGradients, presetById, resolveStops } from '../../engine/gradients';
import { allPatterns } from '../../engine/patterns';
import type { FillContent, FillStop, ID, Pt } from '../../engine/types';
import { Dialog } from '../dialogs';
import { el, q, setHidden } from '../dom';
import { checkRow, colorRow, numberRow, selectRow } from './controls';

type Kind = FillContent['kind'];
const TITLES: Record<Kind, string> = { solid: 'Solid Color', gradient: 'Gradient Fill', pattern: 'Pattern Fill' };
const hex = (c: RGB): string => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const rgbOf = (h: string): RGB => ({ r: parseInt(h.slice(1, 3), 16) || 0, g: parseInt(h.slice(3, 5), 16) || 0, b: parseInt(h.slice(5, 7), 16) || 0 });

/** Layer > New Fill Layer and Layer Content Options on a fill layer (1.66.0): Photoshop's Solid Color, Gradient Fill and
 *  Pattern Fill dialogs in one, its rows for the fill's kind chosen before it shows, so it opens at its size. Each
 *  change shows on the canvas at once without being recorded (engine.previewFill); OK records it, a new layer's making
 *  and setting as one step; Cancel leaves the layer as it was, or takes a new one back. */
export class FillLayerDialog extends Dialog {
  private layerId: ID | null = null;
  private fresh = false;
  private applied = false;
  private kind: Kind = 'solid';
  private stops: FillStop[] = [];
  private kept: FillStop[] | null = null;
  private offset: Pt = { x: 0, y: 0 };
  private frame = 0;
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false">');
  private readonly nameRow: HTMLElement;
  private readonly color = colorRow('Color', () => this.changed());
  private readonly gradient = selectRow('Gradient', [], (v) => { this.stops = v === 'current' && this.kept ? this.kept : this.preset(v); this.changed(); });
  private readonly style = selectRow('Style', GRADIENT_TYPES.map((t) => [t.id, t.label] as [string, string]), () => this.changed());
  private readonly angle = numberRow('Angle (degrees)', -180, 180, 1, () => this.changed());
  private readonly scale = numberRow('Scale (%)', 10, 150, 1, () => this.changed());
  private readonly reverse = checkRow('Reverse', () => this.changed());
  private readonly dither = checkRow('Dither', () => this.changed());
  private readonly align = checkRow('Align with Layer', () => this.changed());
  private readonly pattern = selectRow('Pattern', [], () => this.changed());
  private readonly pAngle = numberRow('Angle (degrees)', -180, 180, 1, () => this.changed());
  private readonly pScale = numberRow('Scale (%)', 1, 1000, 1, () => this.changed());
  private readonly link = checkRow('Link with Layer', () => this.changed());
  private readonly phaseX = numberRow('Offset X (px)', -100000, 100000, 1, () => this.changed());
  private readonly phaseY = numberRow('Offset Y (px)', -100000, 100000, 1, () => this.changed());
  private readonly snap = el<HTMLButtonElement>('<button class="cv-btn" type="button">Snap to Origin</button>');

  constructor(private readonly engine: Engine) {
    super('Solid Color', 380);
    this.nameRow = this.field('Name', this.name);
    this.body.append(this.color.el, this.gradient.el, this.style.el, this.angle.el, this.scale.el, this.reverse.el, this.dither.el, this.align.el, this.pattern.el, this.pAngle.el, this.pScale.el, this.link.el, this.phaseX.el, this.phaseY.el, this.snap);
    this.snap.addEventListener('click', () => { this.phaseX.set(0); this.phaseY.set(0); this.changed(); });
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    for (const i of [this.name, this.angle.input, this.scale.input, this.pAngle.input, this.pScale.input]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.apply(); } });
    this.onClose = () => {
      if (this.applied || !this.layerId) return;
      if (this.fresh) this.engine.dropNewFill(this.layerId); else this.engine.previewFill(null);
    };
  }

  /** Layer > New Fill Layer > Solid Color, Gradient or Pattern: the layer made at once with the foreground colour, the
   *  Gradient tool's gradient or the first pattern, then this dialog over it. */
  showNew(kind: Kind): void {
    if (this.isOpen || !this.engine.current) return;
    const e = this.engine, pats = allPatterns();
    const content: FillContent = kind === 'solid' ? { kind, color: { ...e.fg } }
      : kind === 'gradient' ? { kind, stops: this.preset(e.gradientSettings.style), style: 'linear', angle: 90, scale: 1, reverse: false, dither: false, align: true, offset: { x: 0, y: 0 } }
      : { kind, pattern: e.patternStampPattern && pats.some((p) => p.id === e.patternStampPattern) ? e.patternStampPattern : pats[0]?.id ?? 'builtin:checker', scale: 1, angle: 0, link: true, phase: { x: 0, y: 0 } };
    const id = e.newFillLayer(content);
    if (!id) return;
    this.begin(id, content, true);
  }

  /** Layer > Layer Content Options on a fill layer: its own settings, to change. */
  showEdit(id: ID): void {
    const content = this.engine.current?.layer(id)?.fillContent;
    if (this.isOpen || !content) return;
    this.begin(id, structuredClone(content), false);
  }

  private begin(id: ID, c: FillContent, fresh: boolean): void {
    this.layerId = id;
    this.fresh = fresh;
    this.applied = false;
    this.kind = c.kind;
    this.setTitle(TITLES[c.kind]);
    this.name.value = this.engine.current?.layer(id)?.name ?? '';
    setHidden(this.nameRow, !fresh);
    for (const r of [this.color.el]) setHidden(r, c.kind !== 'solid');
    for (const r of [this.gradient.el, this.style.el, this.angle.el, this.scale.el, this.reverse.el, this.dither.el, this.align.el]) setHidden(r, c.kind !== 'gradient');
    for (const r of [this.pattern.el, this.pAngle.el, this.pScale.el, this.link.el, this.phaseX.el, this.phaseY.el, this.snap]) setHidden(r, c.kind !== 'pattern');
    if (c.kind === 'solid') this.color.set(hex(c.color));
    if (c.kind === 'gradient') {
      this.stops = c.stops;
      this.kept = fresh ? null : c.stops;
      this.offset = { ...c.offset };
      this.options(q<HTMLSelectElement>(this.gradient.el, 'select'), [...(this.kept ? [['current', 'Current gradient'] as [string, string]] : []), ...allGradients().map((p) => [p.id, p.label] as [string, string])]);
      this.gradient.set(this.kept ? 'current' : this.engine.gradientSettings.style);
      this.style.set(c.style);
      this.angle.set(c.angle);
      this.scale.set(Math.round(c.scale * 100));
      this.reverse.set(c.reverse);
      this.dither.set(c.dither);
      this.align.set(c.align);
    }
    if (c.kind === 'pattern') {
      this.phaseX.set(c.phase.x);
      this.phaseY.set(c.phase.y);
      const list = allPatterns().map((p) => [p.id, p.name] as [string, string]);
      if (!list.some(([pid]) => pid === c.pattern)) list.push([c.pattern, 'Missing pattern']);
      this.options(q<HTMLSelectElement>(this.pattern.el, 'select'), list);
      this.pattern.set(c.pattern);
      this.pAngle.set(c.angle);
      this.pScale.set(Math.round(c.scale * 100));
      this.link.set(c.link);
    }
    this.open(fresh ? this.name : q<HTMLElement>(c.kind === 'solid' ? this.color.el : c.kind === 'gradient' ? this.gradient.el : this.pattern.el, 'input, select'));
    if (fresh) this.name.select();
  }

  /** A gradient preset's stops, the foreground and background filled in as they are now. */
  private preset(id: string): FillStop[] {
    return resolveStops(presetById(id), this.engine.fg, this.engine.bg, false).map((s) => ({ at: s.at, color: { ...s.rgb }, alpha: s.alpha }));
  }

  /** A select's options brought to `list` in place, the ones past its end removed. */
  private options(sel: HTMLSelectElement, list: Array<[string, string]>): void {
    while (sel.options.length > list.length) sel.remove(sel.options.length - 1);
    list.forEach(([v, t], i) => { const o = sel.options[i] ?? sel.appendChild(document.createElement('option')); if (o.value !== v) o.value = v; if (o.textContent !== t) o.textContent = t; });
  }

  private content(): FillContent {
    const num = (i: HTMLInputElement, lo: number, hi: number, d: number): number => { const v = Number(i.value); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    const box = (r: { el: HTMLElement }): boolean => q<HTMLInputElement>(r.el, 'input').checked;
    if (this.kind === 'solid') return { kind: 'solid', color: rgbOf(q<HTMLInputElement>(this.color.el, 'input').value) };
    if (this.kind === 'gradient') {
      const style = q<HTMLSelectElement>(this.style.el, 'select').value as Extract<FillContent, { kind: 'gradient' }>['style'];
      return { kind: 'gradient', stops: this.stops, style, angle: num(this.angle.input, -180, 180, 90), scale: num(this.scale.input, 10, 150, 100) / 100, reverse: box(this.reverse), dither: box(this.dither), align: box(this.align), offset: { ...this.offset } };
    }
    return { kind: 'pattern', pattern: q<HTMLSelectElement>(this.pattern.el, 'select').value, scale: num(this.pScale.input, 1, 1000, 100) / 100, angle: num(this.pAngle.input, -180, 180, 0), link: box(this.link), phase: { x: num(this.phaseX.input, -100000, 100000, 0), y: num(this.phaseY.input, -100000, 100000, 0) } };
  }

  /** The canvas shows the dialog's fill, at most once a frame. */
  private changed(): void {
    if (!this.isOpen || this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; if (this.isOpen && this.layerId) this.engine.previewFill(this.layerId, this.content()); });
  }

  private apply(): void {
    const id = this.layerId;
    if (!id) return;
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    const c = this.content();
    this.applied = true;
    this.close();
    if (this.fresh) this.engine.amendNewFill(id, c, this.name.value); else this.engine.setFillContent(id, c);
  }
}
