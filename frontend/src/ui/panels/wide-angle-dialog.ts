import type { Engine } from '../../engine';
import { fitLens, levelRotation, wideAngle, wideIsIdentity, type Constraint, type LensModel, type Orientation, type WideSettings } from '../../engine/wide-angle';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { selectRow, sliderRow } from './controls';

const VIEW_W = 400, VIEW_H = 250;

/** Filter > Adaptive Wide Angle (1.55.8, the parity plan's M4): the layer reprojected from a wide or fisheye lens to
 *  the rectilinear view. Click along features that should be straight to draw constraint lines on the picture here
 *  (New line starts another); Fit to lines finds the field of view that straightens them and levels the first. The
 *  canvas shows the result live; OK is one step. Rows and the picture are built once. */
export class WideAngleDialog extends Dialog {
  private s: WideSettings = { model: 'fisheye', strength: 0, scale: 1, rotation: 0, tiltX: 0, tiltY: 0, local: 0 };
  private lines: Constraint[] = [{ pts: [], orient: 'free' }];
  /** A smart object's Adaptive Wide Angle filter being edited: `done` takes the new settings. */
  private editing: ((settings: Record<string, unknown>) => void) | null = null;
  private smartLayer = false;
  private readonly view = el<HTMLCanvasElement>(`<canvas width="${VIEW_W}" height="${VIEW_H}" style="width: ${VIEW_W}px; height: ${VIEW_H}px; display: block; cursor: crosshair; border-radius: 4px; background: var(--cv-surface-2, #111)"></canvas>`);
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 2.8em"></p>');
  private readonly strength = sliderRow('Strength (field of view)', 0, 100, 1, (v) => { this.s.strength = v / 100; this.schedule(); });
  private lensMm = 14;
  private crop = 1;
  private readonly focalRow = sliderRow('Focal length (mm)', 4, 50, 0.5, (v) => { this.lensMm = v; this.fromLens(); });
  private readonly cropRow = sliderRow('Crop factor', 0.5, 6, 0.1, (v) => { this.crop = v; this.fromLens(); });
  private readonly scale = sliderRow('Scale (%)', 50, 200, 1, (v) => { this.s.scale = v / 100; this.schedule(); });
  private readonly rotation = sliderRow('Rotation (degrees)', -45, 45, 0.1, (v) => { this.s.rotation = v; this.schedule(); });
  private readonly model = selectRow('Correction', [['auto', 'Auto'], ['fisheye', 'Fisheye'], ['equisolid', 'Equisolid fisheye'], ['stereographic', 'Stereographic'], ['perspective', 'Perspective'], ['fullSpherical', 'Full Spherical']], (v) => { this.s = { ...this.s, model: v as LensModel, pick: undefined }; this.syncRows(); this.schedule(); });
  private readonly orient = selectRow('Constraint line', [['free', 'Free (straight)'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical']], (v) => { const l = this.lines[this.lines.length - 1]; l.orient = v as Orientation; this.drawView(); });
  private readonly tiltX = sliderRow('Tilt up and down (degrees)', -60, 60, 0.1, (v) => { this.s.tiltX = v; this.schedule(); });
  private readonly tiltY = sliderRow('Tilt left and right (degrees)', -60, 60, 0.1, (v) => { this.s.tiltY = v; this.schedule(); });
  private readonly local = sliderRow('Local straightening (%)', 0, 100, 1, (v) => { this.s.local = v / 100; this.schedule(); });
  private fit = { k: 1, ox: 0, oy: 0, w: 1, h: 1 };
  private timer = 0;

  constructor(private readonly engine: Engine) {
    super('Adaptive Wide Angle', 440);
    const buttons = el('<div class="cv-welcome-actions"></div>');
    const newLine = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button">New line</button>');
    const clear = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button">Clear lines</button>');
    const fitBtn = el<HTMLButtonElement>('<button class="cv-btn" type="button">Fit to lines</button>');
    newLine.addEventListener('click', () => { if (this.lines[this.lines.length - 1].pts.length) this.lines.push({ pts: [], orient: this.lines[this.lines.length - 1].orient }); this.drawView(); });
    clear.addEventListener('click', () => { this.lines = [{ pts: [], orient: this.lines[this.lines.length - 1].orient }]; this.s = { ...this.s, constraints: undefined }; this.drawView(); this.schedule(); });
    fitBtn.addEventListener('click', () => this.fitToLines());
    buttons.append(newLine, clear, fitBtn);
    this.view.addEventListener('pointerdown', (e) => {
      const r = this.view.getBoundingClientRect(), x = (e.clientX - r.left - this.fit.ox) / this.fit.k, y = (e.clientY - r.top - this.fit.oy) / this.fit.k;
      if (x < 0 || y < 0 || x > this.fit.w || y > this.fit.h) return;
      this.lines[this.lines.length - 1].pts.push({ x, y });
      this.drawView();
    });
    this.body.append(this.view, buttons, this.orient.el, this.model.el, this.focalRow.el, this.cropRow.el, this.strength.el, this.tiltX.el, this.tiltY.el, this.local.el, this.scale.el, this.rotation.el, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.onClose = () => { window.clearTimeout(this.timer); this.engine.setPreview(null); };
    // The lens correction is what stays; strength, scale and rotation are this picture's, and start at nothing.
    this.remember(Array.from([this.strength, this.scale, this.rotation, this.tiltX, this.tiltY, this.local, this.orient]).flatMap((r) => Array.from(r.el.querySelectorAll('input, select'))));
  }

  /** The raster the correction reads: a smart object's source, else the layer's pixels. */
  private source(): { width: number; height: number; canvas: unknown; read(): ImageData } | null {
    const l = this.engine.current?.activeLayer;
    return l?.smart ? l.smart.source : l?.raster ?? null;
  }

  /** The tilt rows belong to Perspective only; shown and hidden in place. */
  private syncRows(): void {
    const persp = this.s.model === 'perspective' || this.s.model === 'auto';
    for (const r of [this.tiltX, this.tiltY]) r.el.style.display = persp ? '' : 'none';
    this.local.el.style.display = '';
  }

  show(edit?: { settings: Record<string, unknown>; done: (settings: Record<string, unknown>) => void }): void {
    const l = this.engine.current?.activeLayer;
    if (!l?.raster || l.isGroup || l.adjustment || l.text || l.shape || (l.smart && !l.smart.source)) { this.engine.notice('Select a pixel layer or a smart object first.'); return; }
    this.smartLayer = !!l.smart;
    this.editing = l.smart ? edit?.done ?? null : null;
    const o = l.smart && edit ? edit.settings : null, num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    this.s = { model: (o?.model as LensModel | undefined) ?? this.s.model, strength: num(o?.strength, 0), scale: num(o?.scale, 1), rotation: num(o?.rotation, 0), tiltX: num(o?.tiltX, 0), tiltY: num(o?.tiltY, 0), local: num(o?.local, 0), pick: o?.pick as WideSettings['pick'] };
    const saved = Array.isArray(o?.constraints) ? (o?.constraints as Constraint[]).map((c) => ({ pts: c.pts.map((p) => ({ x: p.x, y: p.y })), orient: c.orient })) : [];
    this.lines = [...saved, { pts: [], orient: saved.length ? saved[saved.length - 1].orient : 'free' }];
    this.s.constraints = saved.length ? saved : undefined;
    this.strength.set(Math.round(this.s.strength * 100)); this.scale.set(Math.round(this.s.scale * 100)); this.rotation.set(this.s.rotation);
    this.tiltX.set(this.s.tiltX ?? 0); this.tiltY.set(this.s.tiltY ?? 0); this.local.set(Math.round((this.s.local ?? 0) * 100));
    this.model.set(this.s.model); this.orient.set(this.lines[this.lines.length - 1].orient);
    this.focalRow.set(this.lensMm); this.cropRow.set(this.crop);
    this.syncRows();
    this.open();
    this.drawView();
    this.schedule();
  }

  /** The lens's focal length and the sensor's crop factor as a field of view across the diagonal (a full frame diagonal is 43.27 mm). */
  private fromLens(): void {
    const fov = 2 * Math.atan(43.27 / this.crop / (2 * this.lensMm)), strength = Math.min(1, fov / ((179 * Math.PI) / 180));
    this.s = { ...this.s, strength };
    this.strength.set(Math.round(strength * 100));
    setText(this.note, `${this.lensMm} mm at crop factor ${this.crop}: field of view ${Math.round((fov * 180) / Math.PI)} degrees across the diagonal.`);
    this.schedule();
  }

  private drawView(): void {
    const r = this.source(), g = this.view.getContext('2d') as CanvasRenderingContext2D;
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    if (!r) return;
    const w = r.width, h = r.height, k = Math.min(VIEW_W / w, VIEW_H / h), ox = (VIEW_W - w * k) / 2, oy = (VIEW_H - h * k) / 2;
    this.fit = { k, ox, oy, w, h };
    g.drawImage(r.canvas as CanvasImageSource, ox, oy, w * k, h * k);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--cv-accent').trim() || '#f97316';
    g.strokeStyle = accent; g.fillStyle = accent; g.lineWidth = 2; g.font = '11px sans-serif';
    for (const line of this.lines) {
      const pts = line.pts;
      g.setLineDash(line.orient === 'vertical' ? [2, 4] : line.orient === 'horizontal' ? [8, 3] : []);
      g.beginPath();
      pts.forEach((p, i) => { const x = ox + p.x * k, y = oy + p.y * k; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
      g.setLineDash([]);
      for (const p of pts) { g.beginPath(); g.arc(ox + p.x * k, oy + p.y * k, 3, 0, Math.PI * 2); g.fill(); }
      if (pts.length && line.orient !== 'free') g.fillText(line.orient === 'horizontal' ? 'H' : 'V', ox + pts[0].x * k + 6, oy + pts[0].y * k - 6);
    }
    const n = this.ready().length;
    setText(this.note, n ? `${n} line${n > 1 ? 's' : ''} ready: Fit to lines finds the lens and straightens ${n > 1 ? 'them' : 'it'} where ${n > 1 ? 'they lie' : 'it lies'}, and levels the first.` : 'Click three points along something that should be straight (two for a level or plumb line); New line starts another.');
  }

  /** The constraint lines with enough points to use. */
  private ready(): Constraint[] { return this.lines.filter((c) => c.pts.length >= (c.orient === 'free' ? 3 : 2)); }

  /** The settings as the dialog stands: the constraint lines go with them so local straightening can use them. */
  private current(): WideSettings {
    const cons = this.ready().map((c) => ({ pts: c.pts.map((p) => ({ x: p.x, y: p.y })), orient: c.orient }));
    return { ...this.s, constraints: cons.length ? cons : undefined };
  }

  private fitToLines(): void {
    const r = this.source();
    if (!r) return;
    const lines = this.ready();
    if (!lines.length) { setText(this.note, 'Draw a line of at least three points (two for a level or plumb line) first.'); return; }
    const fit = fitLens(lines, r.width, r.height, this.s.model, this.s.strength);
    this.s = { ...this.s, strength: fit.strength, tiltX: fit.tiltX, tiltY: fit.tiltY, pick: fit.pick, local: 1 };
    const rotation = levelRotation(lines[0], r.width, r.height, this.current());
    this.s.rotation = Math.max(-45, Math.min(45, rotation));
    this.strength.set(Math.round(fit.strength * 100)); this.tiltX.set(Math.round(fit.tiltX * 10) / 10); this.tiltY.set(Math.round(fit.tiltY * 10) / 10);
    this.local.set(100); this.rotation.set(Math.round(this.s.rotation * 10) / 10);
    const chose = fit.pick ? ` Auto chose ${fit.pick === 'fullSpherical' ? 'Full Spherical' : fit.pick}.` : '';
    setText(this.note, `Field of view ${Math.round(fit.strength * 179)} degrees across the diagonal; tilt ${fit.tiltX.toFixed(1)} and ${fit.tiltY.toFixed(1)}; rotated ${this.s.rotation.toFixed(1)} degrees.${chose}`);
    this.schedule();
  }

  private schedule(): void {
    if (!this.isOpen || this.smartLayer) return;
    window.clearTimeout(this.timer);
    const s = this.current();
    this.timer = window.setTimeout(() => this.engine.previewImageEdit((src) => wideAngle(src, s)), 60);
  }

  private apply(): void {
    const l = this.engine.current?.activeLayer, s = this.current(), done = this.editing, smart = this.smartLayer;
    window.clearTimeout(this.timer);
    this.close();
    if (!l?.raster) return;
    if (smart) {
      if (wideIsIdentity(s, l.smart!.source.width, l.smart!.source.height)) return;
      const settings = structuredClone(s) as unknown as Record<string, unknown>;
      if (done) done(settings); else this.engine.addSmartFilter('wideangle', settings);
      return;
    }
    if (wideIsIdentity(s, l.raster.width, l.raster.height)) return;
    this.engine.rescaleLayerPixels(l.id, wideAngle(l.raster.read(), s), 'Adaptive Wide Angle');
  }
}
