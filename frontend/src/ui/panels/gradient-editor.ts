import type { Engine, RGB } from '../../engine';
import { allGradients, colorAt, customGradients, gradientsFromJson, noiseStops, presetById, resolveStops, setCustomGradients, type GradientPreset, type GradientStop } from '../../engine/gradients';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { toast } from '../toast';
import { colorRow, selectRow, sliderRow, type Row } from './controls';

const KEY = 'sonny.gradients', BW = 560, BH = 28, SH = 18;
const hex = (c: RGB): string => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Loads saved gradients into the registry; safe when storage is unavailable. */
export function loadSavedGradients(): void {
  let raw: unknown = [];
  try { raw = JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { raw = []; }
  setCustomGradients(gradientsFromJson(raw));
}

/** The Gradient Editor, as Photoshop has it: start from any preset; a Solid gradient's stops are edited on the strip
 *  under the bar (click to add, drag to move, drag well below or Delete to remove) with the selected stop's colour,
 *  opacity and location; a Noise gradient has Roughness and Randomize. New saves it by name; OK makes it the Gradient
 *  tool's gradient. Every row keeps its place; rows that do not apply are disabled. */
export class GradientEditor extends Dialog {
  private stops: GradientStop[] = [];
  private kind: 'solid' | 'noise' = 'solid';
  private seed = 1;
  private rough = 50;
  private sel = 0;
  private dragging = false;
  private readonly bar = el(`<canvas class="cv-grad-bar" width="${BW}" height="${BH}"></canvas>`) as HTMLCanvasElement;
  private readonly strip = el(`<canvas class="cv-grad-strip" width="${BW}" height="${SH}"></canvas>`) as HTMLCanvasElement;
  private readonly presetRow: Row<string>;
  private readonly typeRow: Row<string>;
  private readonly colorR: Row<string>;
  private readonly opacityR: Row<number>;
  private readonly locationR: Row<number>;
  private readonly roughR: Row<number>;
  private readonly randomize = el('<button class="cv-btn" type="button">Randomize</button>') as HTMLButtonElement;
  private readonly deleteBtn = el('<button class="cv-btn" type="button">Delete Stop</button>') as HTMLButtonElement;
  private readonly nameInput = el('<input class="cv-input" type="text" maxlength="60" placeholder="Name">') as HTMLInputElement;

  constructor(private readonly engine: Engine) {
    super('Gradient Editor', BW + 48);
    this.presetRow = selectRow('Preset', [], (id) => this.startFrom(id));
    this.typeRow = selectRow('Type', [['solid', 'Solid'], ['noise', 'Noise']], (v) => { this.kind = v as 'solid' | 'noise'; if (this.kind === 'noise') this.stops = noiseStops(this.seed, this.rough); this.sync(); });
    this.colorR = colorRow('Stop colour', (h) => { const s = this.stops[this.sel]; if (s) { s.color = { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) }; this.draw(); } });
    this.opacityR = sliderRow('Stop opacity (%)', 0, 100, 1, (v) => { const s = this.stops[this.sel]; if (s) { s.alpha = v / 100; this.draw(); } });
    this.locationR = sliderRow('Stop location (%)', 0, 100, 1, (v) => { const s = this.stops[this.sel]; if (s) { s.at = v / 100; this.draw(); } });
    this.roughR = sliderRow('Roughness (%)', 0, 100, 1, (v) => { this.rough = v; this.stops = noiseStops(this.seed, this.rough); this.draw(); });
    this.randomize.addEventListener('click', () => { this.seed = (Math.random() * 0xffffffff) >>> 0; this.stops = noiseStops(this.seed, this.rough); this.draw(); });
    this.deleteBtn.addEventListener('click', () => this.removeStop(this.sel));
    const save = el('<button class="cv-btn" type="button">New</button>') as HTMLButtonElement;
    save.addEventListener('click', () => this.saveAs());
    const actions = el('<div class="cv-field"><span></span><div class="cv-row-actions"></div></div>');
    (actions.lastElementChild as HTMLElement).append(this.randomize, this.deleteBtn);
    const saving = el('<div class="cv-field"><span></span><div class="cv-row-actions"></div></div>');
    (saving.lastElementChild as HTMLElement).append(this.nameInput, save);
    this.body.append(this.presetRow.el, this.typeRow.el, this.bar, this.strip, this.colorR.el, this.opacityR.el, this.locationR.el, this.roughR.el, actions, saving);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.bindStrip();
  }

  show(): void {
    if (this.isOpen) return;
    loadSavedGradients();
    this.fillPresets();
    this.startFrom(this.engine.gradientSettings.style);
    this.open();
  }

  private fillPresets(): void {
    const sel = this.presetRow.el.querySelector('select') as HTMLSelectElement, want = allGradients().map((p) => [p.id, p.label] as const);
    while (sel.options.length > want.length) sel.remove(sel.options.length - 1);
    want.forEach(([v, t], i) => { const o = sel.options[i] ?? sel.appendChild(document.createElement('option')); if (o.value !== v) o.value = v; if (o.textContent !== t) o.textContent = t; });
  }

  private startFrom(id: string): void {
    const p = presetById(id), e = this.engine;
    this.stops = resolveStops(p, e.fg, e.bg, false).map((s) => ({ at: s.at, color: { ...s.rgb }, alpha: s.alpha }));
    this.kind = 'solid';
    this.sel = 0;
    this.presetRow.set(p.id);
    this.sync();
  }

  private sync(): void {
    const solid = this.kind === 'solid', s = this.stops[this.sel];
    this.typeRow.set(this.kind);
    const off = (row: HTMLElement, disabled: boolean): void => { row.classList.toggle('is-off', disabled); for (const i of row.querySelectorAll('input, button')) (i as HTMLInputElement).disabled = disabled; };
    off(this.colorR.el, !solid); off(this.opacityR.el, !solid); off(this.locationR.el, !solid); off(this.roughR.el, solid);
    this.randomize.disabled = solid; this.deleteBtn.disabled = !solid || this.stops.length <= 2;
    if (s && typeof s.color === 'object') this.colorR.set(hex(s.color));
    if (s) { this.opacityR.set(Math.round(s.alpha * 100)); this.locationR.set(Math.round(s.at * 100)); }
    this.roughR.set(this.rough);
    this.draw();
  }

  private sorted(): Array<{ at: number; rgb: RGB; alpha: number }> {
    return this.stops.map((s) => ({ at: s.at, rgb: typeof s.color === 'object' ? s.color : { r: 0, g: 0, b: 0 }, alpha: s.alpha })).sort((a, b) => a.at - b.at);
  }

  private draw(): void {
    const g = this.bar.getContext('2d'), h = this.strip.getContext('2d');
    if (!g || !h) return;
    const stops = this.sorted(), img = g.createImageData(BW, BH);
    for (let x = 0; x < BW; x++) {
      const c = colorAt(stops, x / (BW - 1));
      for (let y = 0; y < BH; y++) {
        const chk = ((x >> 3) + (y >> 3)) % 2 ? 200 : 255, a = c[3] / 255, k = (y * BW + x) * 4;
        img.data[k] = c[0] * a + chk * (1 - a); img.data[k + 1] = c[1] * a + chk * (1 - a); img.data[k + 2] = c[2] * a + chk * (1 - a); img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    h.clearRect(0, 0, BW, SH);
    if (this.kind !== 'solid') return;
    this.stops.forEach((s, i) => {
      const x = s.at * (BW - 1);
      h.fillStyle = typeof s.color === 'object' ? hex(s.color) : '#000';
      h.strokeStyle = i === this.sel ? '#f97316' : '#888';
      h.lineWidth = i === this.sel ? 2 : 1;
      h.beginPath(); h.moveTo(x, 1); h.lineTo(x + 6, 8); h.lineTo(x + 6, SH - 1); h.lineTo(x - 6, SH - 1); h.lineTo(x - 6, 8); h.closePath(); h.fill(); h.stroke();
    });
  }

  private removeStop(i: number): void {
    if (this.kind !== 'solid' || this.stops.length <= 2 || i < 0 || i >= this.stops.length) return;
    this.stops.splice(i, 1);
    this.sel = Math.min(this.sel, this.stops.length - 1);
    this.sync();
  }

  private bindStrip(): void {
    const s = this.strip, at = (e: PointerEvent): { u: number; below: number } => { const r = s.getBoundingClientRect(); return { u: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), below: e.clientY - r.bottom }; };
    s.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.kind !== 'solid') return;
      const { u } = at(e), r = s.getBoundingClientRect(), tol = 8 / r.width;
      let hit = this.stops.findIndex((x) => Math.abs(x.at - u) <= tol);
      if (hit < 0) {
        const c = colorAt(this.sorted(), u);
        this.stops.push({ at: u, color: { r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]) }, alpha: c[3] / 255 });
        hit = this.stops.length - 1;
      }
      this.sel = hit;
      this.dragging = true;
      s.setPointerCapture(e.pointerId);
      this.sync();
    });
    s.addEventListener('pointermove', (e) => { if (!this.dragging) return; const st = this.stops[this.sel]; if (st) { st.at = at(e).u; this.locationR.set(Math.round(st.at * 100)); this.draw(); } });
    s.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (s.hasPointerCapture(e.pointerId)) s.releasePointerCapture(e.pointerId);
      if (at(e).below > 30) this.removeStop(this.sel);
    });
  }

  private edited(id: string, label: string): GradientPreset { return { id, label, stops: this.stops.map((s) => ({ ...s, color: typeof s.color === 'object' ? { ...s.color } : s.color })).sort((a, b) => a.at - b.at) }; }

  private store(list: GradientPreset[]): void {
    setCustomGradients(list);
    try { localStorage.setItem(KEY, JSON.stringify(list.filter((p) => p.id !== 'edited'))); } catch { toast('Gradients cannot be saved in this browser.', 'error'); }
  }

  private saveAs(): void {
    const name = this.nameInput.value.trim();
    if (!name) { toast('Name the gradient first.'); this.nameInput.focus(); return; }
    const existing = customGradients.find((p) => p.label.toLowerCase() === name.toLowerCase()), g = this.edited(existing?.id ?? `user-${Date.now().toString(36)}`, name);
    this.store(existing ? customGradients.map((p) => (p.id === existing.id ? g : p)) : [...customGradients, g]);
    this.nameInput.value = '';
    this.fillPresets();
    this.presetRow.set(g.id);
    toast(`Saved the gradient "${name}".`);
  }

  private apply(): void {
    const g = this.edited('edited', 'Edited gradient');
    this.store([...customGradients.filter((p) => p.id !== 'edited'), g]);
    this.close();
    this.engine.gradientSettings.style = g.id;
    this.engine.renderGradient();
    this.engine.emit('options', null);
  }
}
