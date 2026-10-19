import type { Engine, RGB } from '../../engine';
import { allGradients, colorAt, customGradients, gradientsFromJson, noiseStops, presetById, sampleStops, setCustomGradients, type GradientPreset, type GradientStop, type OpacityStop } from '../../engine/gradients';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { toast } from '../toast';
import { colorRow, selectRow, sliderRow, type Row } from './controls';

const KEY = 'formvis.gradients', BW = 560, BH = 28, SH = 18, DH = 8;
type Kind = 'c' | 'o' | 'cm' | 'om';   // a colour stop, an opacity stop, or the midpoint after one
const MIN = 0.05, MAX = 0.95;
const hex = (c: RGB): string => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Loads saved gradients into the registry; safe when storage is unavailable. */
export function loadSavedGradients(): void {
  let raw: unknown = [];
  try { raw = JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { raw = []; }
  setCustomGradients(gradientsFromJson(raw));
}

/** The Gradient Editor: start from any preset; a Solid gradient's stops are edited on the strip
 *  under the bar (click to add, drag to move, drag well below or Delete to remove) with the selected stop's colour,
 *  opacity and location; a Noise gradient has Roughness and Randomize. New saves it by name; OK makes it the Gradient
 *  tool's gradient. Every row keeps its place; rows that do not apply are disabled. */
export class GradientEditor extends Dialog {
  private stops: GradientStop[] = [];
  private ops: OpacityStop[] = [{ at: 0, alpha: 1 }, { at: 1, alpha: 1 }];
  private kind: 'solid' | 'noise' = 'solid';
  private seed = 1;
  private rough = 50;
  private smooth = 0;
  private presetId = '';
  private pick: { kind: Kind; i: number } = { kind: 'c', i: 0 };
  private dragging = false;
  private readonly bar = el(`<canvas class="cv-grad-bar" width="${BW}" height="${BH}"></canvas>`) as HTMLCanvasElement;
  private readonly strip = el(`<canvas class="cv-grad-strip" width="${BW}" height="${SH + DH}"></canvas>`) as HTMLCanvasElement;
  private readonly opStrip = el(`<canvas class="cv-grad-strip" width="${BW}" height="${SH + DH}"></canvas>`) as HTMLCanvasElement;
  private readonly midR: Row<number>;
  private readonly presetRow: Row<string>;
  private readonly typeRow: Row<string>;
  private readonly colorR: Row<string>;
  private readonly opacityR: Row<number>;
  private readonly locationR: Row<number>;
  private readonly roughR: Row<number>;
  private readonly smoothR: Row<number>;
  private readonly renameBtn = el('<button class="cv-btn" type="button">Rename</button>') as HTMLButtonElement;
  private readonly dropBtn = el('<button class="cv-btn" type="button">Delete Preset</button>') as HTMLButtonElement;
  private readonly randomize = el('<button class="cv-btn" type="button">Randomize</button>') as HTMLButtonElement;
  private readonly deleteBtn = el('<button class="cv-btn" type="button">Delete Stop</button>') as HTMLButtonElement;
  private readonly nameInput = el('<input class="cv-input" type="text" maxlength="60" placeholder="Name">') as HTMLInputElement;

  constructor(private readonly engine: Engine) {
    super('Gradient Editor', BW + 48);
    this.presetRow = selectRow('Preset', [], (id) => this.startFrom(id));
    this.typeRow = selectRow('Type', [['solid', 'Solid'], ['noise', 'Noise']], (v) => { this.kind = v as 'solid' | 'noise'; if (this.kind === 'noise') this.stops = noiseStops(this.seed, this.rough); this.sync(); });
    this.colorR = colorRow('Stop colour', (h) => { const s = this.pick.kind === 'c' ? this.stops[this.pick.i] : undefined; if (s) { s.color = { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) }; this.draw(); } });
    this.opacityR = sliderRow('Stop opacity (%)', 0, 100, 1, (v) => { const s = this.pick.kind === 'o' ? this.ops[this.pick.i] : undefined; if (s) { s.alpha = v / 100; this.draw(); } });
    this.locationR = sliderRow('Stop location (%)', 0, 100, 1, (v) => { const s = this.cur(); if (s && (this.pick.kind === 'c' || this.pick.kind === 'o')) { s.at = v / 100; this.resort(); this.draw(); } });
    this.midR = sliderRow('Midpoint location (%)', 5, 95, 1, (v) => { const s = this.cur(); if (s && (this.pick.kind === 'cm' || this.pick.kind === 'om')) { s.mid = v / 100; this.draw(); } });
    this.roughR = sliderRow('Roughness (%)', 0, 100, 1, (v) => { this.rough = v; this.stops = noiseStops(this.seed, this.rough); this.draw(); });
    this.smoothR = sliderRow('Smoothness (%)', 0, 100, 1, (v) => { this.smooth = v; this.draw(); });
    this.renameBtn.addEventListener('click', () => this.renamePreset());
    this.dropBtn.addEventListener('click', () => this.deletePreset());
    this.randomize.addEventListener('click', () => { this.seed = (Math.random() * 0xffffffff) >>> 0; this.stops = noiseStops(this.seed, this.rough); this.draw(); });
    this.deleteBtn.addEventListener('click', () => this.removeStop());
    const save = el('<button class="cv-btn" type="button">New</button>') as HTMLButtonElement;
    save.addEventListener('click', () => this.saveAs());
    const actions = el('<div class="cv-field"><span></span><div class="cv-row-actions"></div></div>');
    (actions.lastElementChild as HTMLElement).append(this.randomize, this.deleteBtn);
    const saving = el('<div class="cv-field"><span></span><div class="cv-row-actions"></div></div>');
    (saving.lastElementChild as HTMLElement).append(this.nameInput, save);
    const managing = el('<div class="cv-field"><span></span><div class="cv-row-actions"></div></div>');
    (managing.lastElementChild as HTMLElement).append(this.renameBtn, this.dropBtn);
    this.body.append(this.presetRow.el, this.typeRow.el, this.opStrip, this.bar, this.strip, this.colorR.el, this.opacityR.el, this.locationR.el, this.midR.el, this.smoothR.el, this.roughR.el, actions, saving, managing);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.bindStrip(this.strip, false);
    this.bindStrip(this.opStrip, true);
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
    const rgb = (c: GradientStop['color']): { r: number; g: number; b: number } => (c === 'fg' ? { ...e.fg } : c === 'bg' ? { ...e.bg } : { ...c });
    this.stops = p.stops.map((s) => ({ at: s.at, color: rgb(s.color), alpha: s.alpha, ...(s.mid !== undefined ? { mid: s.mid } : {}) })).sort((a, b) => a.at - b.at);
    // A preset without separate opacity stops gets them from its stops' opacities (one pair when they are all alike).
    this.ops = p.opacityStops?.length ? p.opacityStops.map((s) => ({ ...s })).sort((a, b) => a.at - b.at)
      : p.stops.every((s) => s.alpha === p.stops[0].alpha) ? [{ at: 0, alpha: p.stops[0].alpha }, { at: 1, alpha: p.stops[0].alpha }]
        : p.stops.map((s) => ({ at: s.at, alpha: s.alpha, ...(s.mid !== undefined ? { mid: s.mid } : {}) })).sort((a, b) => a.at - b.at);
    this.kind = 'solid';
    this.smooth = Math.round((p.smooth ?? 0) * 100);
    this.presetId = p.id;
    this.pick = { kind: 'c', i: 0 };
    this.presetRow.set(p.id);
    this.sync();
  }

  private sync(): void {
    const solid = this.kind === 'solid', k = this.pick.kind;
    const list = k === 'c' || k === 'cm' ? this.stops : this.ops;
    this.pick.i = Math.max(0, Math.min(this.pick.i, list.length - 1));
    const s = list[this.pick.i], mid = k === 'cm' || k === 'om';
    this.typeRow.set(this.kind);
    const off = (row: HTMLElement, disabled: boolean): void => { row.classList.toggle('is-off', disabled); for (const i of row.querySelectorAll('input, button')) (i as HTMLInputElement).disabled = disabled; };
    off(this.colorR.el, !solid || k !== 'c'); off(this.opacityR.el, !solid || k !== 'o'); off(this.locationR.el, !solid || mid); off(this.midR.el, !solid || !mid); off(this.roughR.el, solid); off(this.smoothR.el, !solid);
    const mine = customGradients.some((q) => q.id === this.presetId && q.id !== 'edited');
    this.renameBtn.disabled = !mine; this.dropBtn.disabled = !mine;
    this.smoothR.set(this.smooth);
    this.randomize.disabled = solid; this.deleteBtn.disabled = !solid || mid || list.length <= 1;
    if (k === 'c' && s && 'color' in s && s.color && typeof s.color === 'object') this.colorR.set(hex(s.color as RGB));
    if (k === 'o' && s) this.opacityR.set(Math.round(s.alpha * 100));
    if (s && !mid) this.locationR.set(Math.round(s.at * 100));
    if (s && mid) this.midR.set(Math.round((s.mid ?? 0.5) * 100));
    this.roughR.set(this.rough);
    this.draw();
  }

  /** The selected stop (for a midpoint, the stop it follows). */
  private cur(): GradientStop | OpacityStop | undefined { return (this.pick.kind === 'c' || this.pick.kind === 'cm' ? this.stops : this.ops)[this.pick.i]; }

  /** Puts both lists back in order after a move, keeping the selection on the same stop. */
  private resort(): void {
    const s = this.cur();
    this.stops.sort((a, b) => a.at - b.at); this.ops.sort((a, b) => a.at - b.at);
    if (s) this.pick.i = Math.max(0, (this.pick.kind === 'c' || this.pick.kind === 'cm' ? this.stops : this.ops).indexOf(s as never));
  }

  private asPreset(): GradientPreset {
    return { id: '', label: '', stops: this.stops, ...(this.kind === 'solid' && this.ops.length ? { opacityStops: this.ops } : {}), ...(this.kind === 'solid' && this.smooth > 0 ? { smooth: this.smooth / 100 } : {}) };
  }

  private draw(): void {
    const g = this.bar.getContext('2d'), h = this.strip.getContext('2d'), o = this.opStrip.getContext('2d');
    if (!g || !h || !o) return;
    const black = { r: 0, g: 0, b: 0 }, stops = sampleStops(this.asPreset(), black, black), img = g.createImageData(BW, BH);
    for (let x = 0; x < BW; x++) {
      const c = colorAt(stops, x / (BW - 1));
      for (let y = 0; y < BH; y++) {
        const chk = ((x >> 3) + (y >> 3)) % 2 ? 200 : 255, a = c[3] / 255, k = (y * BW + x) * 4;
        img.data[k] = c[0] * a + chk * (1 - a); img.data[k + 1] = c[1] * a + chk * (1 - a); img.data[k + 2] = c[2] * a + chk * (1 - a); img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    h.clearRect(0, 0, BW, SH + DH); o.clearRect(0, 0, BW, SH + DH);
    if (this.kind !== 'solid') return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#aba0d3';
    // Colour stops point up at the bar from the strip below it; opacity stops point down at it from the strip above.
    const stopShape = (c: CanvasRenderingContext2D, x: number, up: boolean, fill: string, on: boolean): void => {
      const y0 = up ? 1 : SH + DH - 1, y1 = up ? 8 : SH + DH - 8, y2 = up ? SH - 1 : DH + 1;
      c.fillStyle = fill; c.strokeStyle = on ? accent : '#888'; c.lineWidth = on ? 2 : 1;
      c.beginPath(); c.moveTo(x, y0); c.lineTo(x + 6, y1); c.lineTo(x + 6, y2); c.lineTo(x - 6, y2); c.lineTo(x - 6, y1); c.closePath(); c.fill(); c.stroke();
    };
    const diamond = (c: CanvasRenderingContext2D, x: number, y: number, on: boolean): void => {
      c.fillStyle = on ? accent : '#bbb'; c.strokeStyle = '#555'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x + 4, y); c.lineTo(x, y + 4); c.lineTo(x - 4, y); c.closePath(); c.fill(); c.stroke();
    };
    const mids = (c: CanvasRenderingContext2D, l: Array<GradientStop | OpacityStop>, y: number, kind: Kind): void => {
      for (let i = 0; i + 1 < l.length; i++) diamond(c, (l[i].at + (l[i + 1].at - l[i].at) * (l[i].mid ?? 0.5)) * (BW - 1), y, this.pick.kind === kind && this.pick.i === i);
    };
    this.stops.forEach((s, i) => stopShape(h, s.at * (BW - 1), true, typeof s.color === 'object' ? hex(s.color) : '#000', this.pick.kind === 'c' && this.pick.i === i));
    mids(h, this.stops, SH + DH / 2 + 1, 'cm');
    this.ops.forEach((s, i) => { const v = Math.round(255 * (1 - s.alpha)); stopShape(o, s.at * (BW - 1), false, `rgb(${v}, ${v}, ${v})`, this.pick.kind === 'o' && this.pick.i === i); });
    mids(o, this.ops, DH / 2 - 1, 'om');
  }

  /** Removes the selected colour or opacity stop; one of each kind always stays. */
  private removeStop(): void {
    const k = this.pick.kind, list: Array<GradientStop | OpacityStop> = k === 'c' ? this.stops : this.ops;
    if (this.kind !== 'solid' || (k !== 'c' && k !== 'o') || list.length <= 1 || this.pick.i < 0 || this.pick.i >= list.length) return;
    list.splice(this.pick.i, 1);
    this.pick.i = Math.min(this.pick.i, list.length - 1);
    this.sync();
  }

  private bindStrip(s: HTMLCanvasElement, opacity: boolean): void {
    const at = (e: PointerEvent): { u: number; y: number; out: number } => {
      const r = s.getBoundingClientRect();
      return { u: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: ((e.clientY - r.top) / r.height) * (SH + DH), out: opacity ? r.top - e.clientY : e.clientY - r.bottom };
    };
    const stopKind: Kind = opacity ? 'o' : 'c', midKind: Kind = opacity ? 'om' : 'cm';
    const list = (): Array<GradientStop | OpacityStop> => (opacity ? this.ops : this.stops);
    s.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.kind !== 'solid') return;
      const { u, y } = at(e), r = s.getBoundingClientRect(), tol = 8 / r.width, l = list();
      const inDiamonds = opacity ? y < DH : y > SH;
      let midHit = -1;
      if (inDiamonds) midHit = l.findIndex((x, i) => i + 1 < l.length && Math.abs(x.at + (l[i + 1].at - x.at) * (x.mid ?? 0.5) - u) <= tol);
      if (midHit >= 0) this.pick = { kind: midKind, i: midHit };
      else {
        let hit = l.findIndex((x) => Math.abs(x.at - u) <= tol);
        if (hit < 0) {
          const black = { r: 0, g: 0, b: 0 }, c = colorAt(sampleStops(this.asPreset(), black, black), u);
          if (opacity) this.ops.push({ at: u, alpha: c[3] / 255 }); else this.stops.push({ at: u, color: { r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]) }, alpha: c[3] / 255 });
          l.sort((a, b) => a.at - b.at);
          hit = l.findIndex((x) => x.at === u);
        }
        this.pick = { kind: stopKind, i: hit };
      }
      this.dragging = true;
      s.setPointerCapture(e.pointerId);
      this.sync();
    });
    s.addEventListener('pointermove', (e) => {
      if (!this.dragging || (this.pick.kind !== stopKind && this.pick.kind !== midKind)) return;
      const l = list(), st = l[this.pick.i], { u } = at(e);
      if (!st) return;
      if (this.pick.kind === stopKind) { st.at = u; this.resort(); this.locationR.set(Math.round(u * 100)); }
      else { const nx = l[this.pick.i + 1]; if (!nx) return; st.mid = Math.min(MAX, Math.max(MIN, nx.at > st.at ? (u - st.at) / (nx.at - st.at) : 0.5)); this.midR.set(Math.round(st.mid * 100)); }
      this.draw();
    });
    s.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (s.hasPointerCapture(e.pointerId)) s.releasePointerCapture(e.pointerId);
      if (this.pick.kind === stopKind && at(e).out > 30) this.removeStop();
    });
  }

  private edited(id: string, label: string): GradientPreset {
    const cols = this.stops.map((s) => ({ ...s, color: typeof s.color === 'object' ? { ...s.color } : s.color })).sort((a, b) => a.at - b.at);
    if (this.kind !== 'solid') return { id, label, stops: cols };
    const black = { r: 0, g: 0, b: 0 }, dense = sampleStops(this.asPreset(), black, black);
    // A lone colour stop is kept as two alike, so the saved list reads back; each stop's alpha is the opacity there.
    if (cols.length === 1) cols.push({ ...cols[0], at: cols[0].at < 1 ? 1 : 0 });
    for (const s of cols) s.alpha = colorAt(dense, s.at)[3] / 255;
    cols.sort((a, b) => a.at - b.at);
    return { id, label, stops: cols, opacityStops: this.ops.map((s) => ({ ...s })).sort((a, b) => a.at - b.at), ...(this.smooth > 0 ? { smooth: this.smooth / 100 } : {}) };
  }

  private renamePreset(): void {
    const name = this.nameInput.value.trim(), cur = customGradients.find((p) => p.id === this.presetId);
    if (!cur) return;
    if (!name) { toast('Type the new name first.'); this.nameInput.focus(); return; }
    if (customGradients.some((p) => p.id !== cur.id && p.label.toLowerCase() === name.toLowerCase())) { toast(`A gradient called "${name}" exists.`); return; }
    this.store(customGradients.map((p) => (p.id === cur.id ? { ...p, label: name.slice(0, 60) } : p)));
    this.nameInput.value = '';
    this.fillPresets();
    this.presetRow.set(cur.id);
    toast(`Renamed the gradient to "${name}".`);
  }

  private deletePreset(): void {
    const cur = customGradients.find((p) => p.id === this.presetId && p.id !== 'edited');
    if (!cur) return;
    this.store(customGradients.filter((p) => p.id !== cur.id));
    this.fillPresets();
    this.startFrom(allGradients()[0].id);
    toast(`Deleted the gradient "${cur.label}".`);
  }

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
    this.presetId = g.id;
    this.sync();
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
