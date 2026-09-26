import type { Engine } from '../engine';
import type { Layer, TextSpec } from '../engine/types';
import { setType } from '../extensions/tools/type';
import { el, setHidden, setText } from './dom';
import { fontFamilies } from './fonts';
import { icon } from './icons';
import { PanelGroup } from './panel-group';

/** The Properties column (Phase 21, UI_SPEC.md sections 5 and 6, the target's s20): Properties (the active layer's
 *  placement: W, X, H, Y, with a link that keeps the aspect), Brushes (the tip, Size and Hardness, a stroke preview, and
 *  Brush Settings), Paragraph (alignment) and Character (font, style, size, leading, tracking, kerning), each bound to
 *  the engine: a committed field is one undo step. Only what sonny's engine does is shown: no dead controls. */

/** A numeric field as the target's: Enter or leaving commits; arrows step by `step`, Shift by ten times it; clamped;
 *  not overwritten while it has focus. */
function numField(unit: string, label: string, min: number, max: number, step: number, commit: (v: number) => void): { root: HTMLElement; set: (v: number | null) => void } {
  const root = el(`<span class="cv-num"><input type="text" inputmode="decimal" aria-label="${label}"><span class="cv-unit"></span></span>`);
  const input = root.querySelector('input') as HTMLInputElement;
  setText(root.querySelector('.cv-unit') as HTMLElement, unit);
  const put = (v: number): void => { const c = Math.min(max, Math.max(min, v)); input.value = String(Math.round(c * 100) / 100); commit(c); };
  input.addEventListener('change', () => { const n = parseFloat(input.value); if (Number.isFinite(n)) put(n); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { input.blur(); return; }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    put((parseFloat(input.value) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
  });
  return { root, set: (v) => { if (document.activeElement === input) return; input.value = v === null ? '' : String(Math.round(v * 100) / 100); input.disabled = v === null; } };
}

const kindIcon = (l: Layer): string => (l.isGroup ? 'folder' : l.adjustment ? 'halfCircle' : l.text ? 'typeTool' : l.vector ? 'rectTool' : l.smart ? 'smartObject' : 'image');

export class PropertiesColumn {
  readonly root: HTMLElement;
  private readonly refreshers: Array<() => void> = [];

  constructor(host: HTMLElement, private readonly engine: Engine, run: (cmd: string) => void) {
    this.root = host;
    this.properties();
    this.brushes(run);
    this.paragraph();
    this.character();
    const refresh = (): void => { for (const r of this.refreshers) r(); };
    for (const ev of ['active', 'doc', 'history', 'options', 'projects'] as const) engine.on(ev, refresh);
    document.addEventListener('cv:type-settings', refresh);
    refresh();
  }

  private properties(): void {
    const e = this.engine;
    const body = el(`<div class="cv-props">
      <div class="cv-props-head"><span class="cv-props-tile"></span><span class="cv-props-name"></span></div>
      <button class="cv-props-section" type="button" aria-expanded="true">${icon('chevronDown', 12)}<span>Transform</span></button>
      <div class="cv-props-transform"><button class="cv-link-btn is-on" type="button" title="Keep the aspect" aria-pressed="true">${icon('link', 14)}</button><div class="cv-props-grid"></div></div>
      <p class="cv-props-none">Select a layer with pixels to see its placement.</p>
    </div>`);
    const grid = body.querySelector('.cv-props-grid') as HTMLElement, link = body.querySelector('.cv-link-btn') as HTMLButtonElement;
    const tr = body.querySelector('.cv-props-transform') as HTMLElement, none = body.querySelector('.cv-props-none') as HTMLElement;
    const section = body.querySelector('.cv-props-section') as HTMLButtonElement;
    section.addEventListener('click', () => { const open = section.getAttribute('aria-expanded') !== 'true'; section.setAttribute('aria-expanded', String(open)); setHidden(tr, !open); });
    link.addEventListener('click', () => { const on = !link.classList.contains('is-on'); link.classList.toggle('is-on', on); link.setAttribute('aria-pressed', String(on)); });
    const layer = (): Layer | null => { const l = e.activeLayer; return l && !l.isGroup && !l.adjustment ? l : null; };
    const set = (patch: { x?: number; y?: number; w?: number; h?: number }): void => {
      const l = layer();
      if (!l) return;
      const t = l.transform;
      if (link.classList.contains('is-on') && t.w && t.h) {
        if (patch.w !== undefined) patch.h = (patch.w * t.h) / t.w;
        else if (patch.h !== undefined) patch.w = (patch.h * t.w) / t.h;
      }
      e.setLayerTransform(patch);
    };
    const f = {
      w: numField('px', 'Width', 1, 30000, 1, (v) => set({ w: v })), x: numField('px', 'X', -30000, 30000, 1, (v) => set({ x: v })),
      h: numField('px', 'Height', 1, 30000, 1, (v) => set({ h: v })), y: numField('px', 'Y', -30000, 30000, 1, (v) => set({ y: v })),
    };
    for (const [k, lbl] of [['w', 'W'], ['x', 'X'], ['h', 'H'], ['y', 'Y']] as const) {
      const row = el(`<label class="cv-props-field"><span>${lbl}</span></label>`);
      row.appendChild(f[k].root);
      grid.appendChild(row);
    }
    const tile = body.querySelector('.cv-props-tile') as HTMLElement, name = body.querySelector('.cv-props-name') as HTMLElement;
    new PanelGroup(this.root, 'properties', [{ id: 'properties', label: 'Properties', body }], 'Properties');
    this.refreshers.push(() => {
      const a = e.activeLayer, l = layer();
      tile.innerHTML = a ? icon(kindIcon(a), 18) : '';
      setText(name, a ? `${a.name} Properties` : 'No layer selected');
      // The section keeps its place whatever is selected (its fields disabled when there is nothing to place), so the
      // groups beneath never jump when a document opens or the selection changes; only the fold changes its height.
      setHidden(tr, section.getAttribute('aria-expanded') !== 'true');
      setHidden(section, false);
      setHidden(none, true);
      for (const k of ['w', 'x', 'h', 'y'] as const) f[k].set(l ? l.transform[k] : null);
    });
  }

  private brushes(run: (cmd: string) => void): void {
    const e = this.engine;
    const body = el(`<div class="cv-brushes">
      <div class="cv-brush-top"><canvas class="cv-brush-tip" aria-label="Brush tip"></canvas><div class="cv-brush-sliders"></div></div>
      <div class="cv-brush-stroke-head"><span>Stroke preview</span></div><canvas class="cv-brush-stroke" aria-label="Stroke preview"></canvas>
      <div class="cv-brush-actions"><button class="cv-btn" type="button" data-run="brush-settings">${icon('sliders', 14)}<span>Brush Settings</span></button></div>
    </div>`);
    const sliders = body.querySelector('.cv-brush-sliders') as HTMLElement;
    const tip = body.querySelector('.cv-brush-tip') as HTMLCanvasElement, stroke = body.querySelector('.cv-brush-stroke') as HTMLCanvasElement;
    const LOG = Math.log(1000);
    const rows = [
      { label: 'Size', unit: 'px', min: 1, max: 1000, step: 1, get: () => e.brush.diameter, put: (v: number) => e.setBrush({ diameter: Math.round(v) }), toS: (v: number) => (Math.log(v) / LOG) * 1000, fromS: (s: number) => Math.exp((s / 1000) * LOG) },
      { label: 'Hardness', unit: '%', min: 0, max: 100, step: 1, get: () => e.brush.hardness * 100, put: (v: number) => e.setBrush({ hardness: v / 100 }), toS: (v: number) => v * 10, fromS: (s: number) => s / 10 },
    ];
    const setters: Array<() => void> = [];
    for (const r of rows) {
      const row = el(`<div class="cv-brush-row"><div class="cv-brush-row-head"><span>${r.label}:</span></div><input class="cv-slider" type="range" min="0" max="1000" step="1" aria-label="${r.label}"></div>`);
      const field = numField(r.unit, r.label, r.min, r.max, r.step, r.put), slider = row.querySelector('input') as HTMLInputElement;
      (row.querySelector('.cv-brush-row-head') as HTMLElement).appendChild(field.root);
      slider.addEventListener('input', () => r.put(Math.min(r.max, Math.max(r.min, r.fromS(Number(slider.value))))));
      setters.push(() => { field.set(r.get()); if (document.activeElement !== slider) slider.value = String(Math.round(r.toS(Math.max(r.min, r.get())))); });
      sliders.appendChild(row);
    }
    (body.querySelector('[data-run]') as HTMLElement).addEventListener('click', () => run('brush-settings'));
    new PanelGroup(this.root, 'brushes', [{ id: 'brushes', label: 'Brushes', body }], 'Brushes');
    const dab = (g: CanvasRenderingContext2D, x: number, y: number, r: number, hard: number): void => {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(236,236,240,1)'); grad.addColorStop(Math.min(0.999, Math.max(0, hard)), 'rgba(236,236,240,1)'); grad.addColorStop(1, 'rgba(236,236,240,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    const paint = (): void => {
      const dpr = window.devicePixelRatio || 1;
      for (const c of [tip, stroke]) { const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr); if (w && h && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; } }
      const hard = e.brush.hardness;
      const tg = tip.getContext('2d') as CanvasRenderingContext2D;
      tg.clearRect(0, 0, tip.width, tip.height);
      if (tip.width) {
        const R = tip.width * 0.36, cx = tip.width / 2, cy = tip.height / 2;
        tg.strokeStyle = 'rgba(255,255,255,0.18)'; tg.lineWidth = dpr; tg.beginPath(); tg.moveTo(cx - R * 1.2, cy); tg.lineTo(cx + R * 1.2, cy); tg.moveTo(cx, cy - R * 1.2); tg.lineTo(cx, cy + R * 1.2); tg.stroke();
        dab(tg, cx, cy, R, hard);
      }
      const sg = stroke.getContext('2d') as CanvasRenderingContext2D;
      sg.clearRect(0, 0, stroke.width, stroke.height);
      if (stroke.width) {
        const W = stroke.width, H = stroke.height, r = Math.max(2 * dpr, Math.min(H * 0.28, (e.brush.diameter / 2) * dpr));
        for (let i = 0; i <= 120; i++) { const t = i / 120; dab(sg, W * 0.12 + t * W * 0.76, H / 2 - Math.sin(t * Math.PI * 2) * H * 0.18, r, hard); }
      }
    };
    this.refreshers.push(() => { for (const s of setters) s(); requestAnimationFrame(paint); });
  }

  private paragraph(): void {
    const e = this.engine;
    const body = el(`<div class="cv-para"><div class="cv-seg" role="group" aria-label="Alignment">${(['left', 'center', 'right'] as const).map((a) => `<button type="button" data-align="${a}" title="Align ${a}" aria-label="Align ${a}">${icon(a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : 'alignRight', 16)}</button>`).join('')}</div></div>`);
    const btns = Array.from(body.querySelectorAll<HTMLButtonElement>('[data-align]'));
    for (const b of btns) b.addEventListener('click', () => setType(e, { align: b.dataset.align as TextSpec['align'] }));
    new PanelGroup(this.root, 'paragraph', [{ id: 'paragraph', label: 'Paragraph', body }], 'Paragraph');
    this.refreshers.push(() => { for (const b of btns) { const on = b.dataset.align === e.textSettings.align; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); } });
  }

  private character(): void {
    const e = this.engine;
    const body = el(`<div class="cv-char"></div>`);
    const row = (label: string, control: HTMLElement): void => { const r = el(`<label class="cv-char-row"><span>${label}</span></label>`); r.appendChild(control); body.appendChild(r); };
    const font = el<HTMLSelectElement>('<select class="cv-select" aria-label="Font"></select>');
    const style = el<HTMLSelectElement>('<select class="cv-select" aria-label="Style"><option value="00">Regular</option><option value="10">Bold</option><option value="01">Italic</option><option value="11">Bold Italic</option></select>');
    const kern = el<HTMLSelectElement>('<select class="cv-select" aria-label="Kerning"><option value="metrics">Metrics</option><option value="none">None</option></select>');
    font.addEventListener('change', () => setType(e, { family: font.value }));
    style.addEventListener('change', () => setType(e, { bold: style.value[0] === '1', italic: style.value[1] === '1' }));
    kern.addEventListener('change', () => setType(e, { kerning: kern.value as TextSpec['kerning'] }));
    const size = numField('pt', 'Size', 1, 1296, 1, (v) => setType(e, { size: v }));
    const leading = numField('pt', 'Leading', 1, 5000, 1, (v) => setType(e, { lineHeight: v / Math.max(1, e.textSettings.size) }));
    const tracking = numField('', 'Tracking', -1000, 10000, 10, (v) => setType(e, { tracking: Math.round(v) }));
    row('Font', font); row('Style', style); row('Size', size.root); row('Leading', leading.root); row('Tracking', tracking.root); row('Kerning', kern);
    new PanelGroup(this.root, 'character', [{ id: 'character', label: 'Character', body }], 'Character');
    let fonts = '';
    this.refreshers.push(() => {
      const t = e.textSettings, list = fontFamilies(), key = list.join('|');
      if (key !== fonts || !list.includes(t.family)) {
        fonts = key;
        font.textContent = '';
        for (const f of list.includes(t.family) ? list : [t.family, ...list]) { const o = document.createElement('option'); o.value = f; o.textContent = f; font.appendChild(o); }
      }
      if (document.activeElement !== font) font.value = t.family;
      if (document.activeElement !== style) style.value = `${t.bold ? 1 : 0}${t.italic ? 1 : 0}`;
      if (document.activeElement !== kern) kern.value = t.kerning;
      size.set(t.size); leading.set(Math.round(t.size * t.lineHeight * 10) / 10); tracking.set(t.tracking);
    });
  }
}
