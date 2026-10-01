import type { Engine } from '../../engine';
import { fitStrength, levelRotation, wideAngle, type LensModel, type Pt2, type WideSettings } from '../../engine/wide-angle';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { selectRow, sliderRow } from './controls';

const VIEW_W = 400, VIEW_H = 250;

/** Filter > Adaptive Wide Angle (1.55.8, the parity plan's M4): the layer reprojected from a wide or fisheye lens to
 *  the rectilinear view. Click along features that should be straight to draw constraint lines on the picture here
 *  (New line starts another); Fit to lines finds the field of view that straightens them and levels the first. The
 *  canvas shows the result live; OK is one step. Rows and the picture are built once. */
export class WideAngleDialog extends Dialog {
  private s: WideSettings = { model: 'fisheye', strength: 0, scale: 1, rotation: 0 };
  private lines: Pt2[][] = [[]];
  private readonly view = el<HTMLCanvasElement>(`<canvas width="${VIEW_W}" height="${VIEW_H}" style="width: ${VIEW_W}px; height: ${VIEW_H}px; display: block; cursor: crosshair; border-radius: 4px; background: var(--cv-surface-2, #111)"></canvas>`);
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 2.8em"></p>');
  private readonly strength = sliderRow('Strength (field of view)', 0, 100, 1, (v) => { this.s.strength = v / 100; this.schedule(); });
  private readonly scale = sliderRow('Scale (%)', 50, 200, 1, (v) => { this.s.scale = v / 100; this.schedule(); });
  private readonly rotation = sliderRow('Rotation (degrees)', -45, 45, 0.1, (v) => { this.s.rotation = v; this.schedule(); });
  private readonly model = selectRow('Correction', [['fisheye', 'Fisheye'], ['equisolid', 'Equisolid fisheye'], ['stereographic', 'Stereographic']], (v) => { this.s.model = v as LensModel; this.schedule(); });
  private fit = { k: 1, ox: 0, oy: 0, w: 1, h: 1 };
  private timer = 0;

  constructor(private readonly engine: Engine) {
    super('Adaptive Wide Angle', 440);
    const buttons = el('<div class="cv-welcome-actions"></div>');
    const newLine = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button">New line</button>');
    const clear = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button">Clear lines</button>');
    const fitBtn = el<HTMLButtonElement>('<button class="cv-btn" type="button">Fit to lines</button>');
    newLine.addEventListener('click', () => { if (this.lines[this.lines.length - 1].length) this.lines.push([]); this.drawView(); });
    clear.addEventListener('click', () => { this.lines = [[]]; this.drawView(); });
    fitBtn.addEventListener('click', () => this.fitToLines());
    buttons.append(newLine, clear, fitBtn);
    this.view.addEventListener('pointerdown', (e) => {
      const r = this.view.getBoundingClientRect(), x = (e.clientX - r.left - this.fit.ox) / this.fit.k, y = (e.clientY - r.top - this.fit.oy) / this.fit.k;
      if (x < 0 || y < 0 || x > this.fit.w || y > this.fit.h) return;
      this.lines[this.lines.length - 1].push({ x, y });
      this.drawView();
    });
    this.body.append(this.view, buttons, this.model.el, this.strength.el, this.scale.el, this.rotation.el, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.onClose = () => { window.clearTimeout(this.timer); this.engine.setPreview(null); };
  }

  show(): void {
    const l = this.engine.current?.activeLayer;
    if (!l?.raster || l.isGroup || l.adjustment || l.text || l.shape || l.smart) { this.engine.notice('Select a pixel layer first.'); return; }
    this.s = { model: this.s.model, strength: 0, scale: 1, rotation: 0 };
    this.lines = [[]];
    this.strength.set(0); this.scale.set(100); this.rotation.set(0); this.model.set(this.s.model);
    this.open();
    this.drawView();
    this.schedule();
  }

  private drawView(): void {
    const l = this.engine.current?.activeLayer, g = this.view.getContext('2d') as CanvasRenderingContext2D;
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    if (!l?.raster) return;
    const w = l.raster.width, h = l.raster.height, k = Math.min(VIEW_W / w, VIEW_H / h), ox = (VIEW_W - w * k) / 2, oy = (VIEW_H - h * k) / 2;
    this.fit = { k, ox, oy, w, h };
    g.drawImage(l.raster.canvas as CanvasImageSource, ox, oy, w * k, h * k);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--cv-accent').trim() || '#f97316';
    g.strokeStyle = accent; g.fillStyle = accent; g.lineWidth = 2;
    for (const line of this.lines) {
      g.beginPath();
      line.forEach((p, i) => { const x = ox + p.x * k, y = oy + p.y * k; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
      for (const p of line) { g.beginPath(); g.arc(ox + p.x * k, oy + p.y * k, 3, 0, Math.PI * 2); g.fill(); }
    }
    const n = this.lines.filter((x) => x.length >= 3).length;
    setText(this.note, n ? `${n} line${n > 1 ? 's' : ''} ready: Fit to lines finds the field of view that straightens ${n > 1 ? 'them' : 'it'} and levels the first.` : 'Click at least three points along something that should be straight; New line starts another.');
  }

  private fitToLines(): void {
    const l = this.engine.current?.activeLayer;
    if (!l?.raster) return;
    const lines = this.lines.filter((x) => x.length >= 3);
    if (!lines.length) { setText(this.note, 'Draw a line of at least three points first.'); return; }
    const strength = fitStrength(lines, l.raster.width, l.raster.height, this.s.model), rotation = levelRotation(lines[0], l.raster.width, l.raster.height, this.s.model, strength);
    this.s = { ...this.s, strength, rotation: Math.max(-45, Math.min(45, rotation)) };
    this.strength.set(Math.round(strength * 100)); this.rotation.set(Math.round(this.s.rotation * 10) / 10);
    setText(this.note, `Field of view ${Math.round(strength * 179)} degrees across the diagonal; rotated ${this.s.rotation.toFixed(1)} degrees.`);
    this.schedule();
  }

  private schedule(): void {
    if (!this.isOpen) return;
    window.clearTimeout(this.timer);
    const s = { ...this.s };
    this.timer = window.setTimeout(() => this.engine.previewImageEdit((src) => wideAngle(src, s)), 60);
  }

  private apply(): void {
    const l = this.engine.current?.activeLayer, s = { ...this.s };
    window.clearTimeout(this.timer);
    this.close();
    if (!l?.raster) return;
    if (s.strength <= 0 && s.scale === 1 && !s.rotation) return;
    this.engine.rescaleLayerPixels(l.id, wideAngle(l.raster.read(), s), 'Adaptive Wide Angle');
  }
}
