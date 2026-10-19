import type { Engine } from '../engine';
import { allBrushPresets, brushGroupOf, type BrushPreset } from '../engine/brush-dynamics';
import { drawBrushStroke, previewOfEngine, previewOfPreset } from './brush-stroke-preview';
import { el, setHidden, setText } from './dom';
import { recalled, remembered } from './prefs';

/** The Brush Preset picker: a popup at the pointer with Size, Hardness, a search and every preset by folder, each with its
 *  own stroke, the ones used last first; opened by a plain right-click on a painting tool when Right-click is set to
 *  Preset picker. A click tries a brush (the stroke above shows it); Use, a double click or a click outside keeps it,
 *  Revert or Escape puts the earlier brush back. Built once; the rows are made once and moved in place. */
export class BrushPicker {
  private readonly root = el(`<div class="cv-brush-picker" role="dialog" aria-label="Brush Preset picker" hidden>
    <label>Size <input type="range" min="1" max="500" step="1" data-k="size"><output data-o="size"></output></label>
    <label>Hardness <input type="range" min="0" max="100" step="1" data-k="hardness"><output data-o="hardness"></output></label>
    <canvas class="cv-bp-now" width="236" height="44" aria-label="Current brush stroke" style="display:block;width:100%;height:44px;color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-primary)"></canvas>
    <input type="search" placeholder="Search brushes" aria-label="Search brushes" data-k="find">
    <div class="cv-bp-list"></div>
    <div class="cv-bp-foot" style="display:flex;gap:6px;justify-content:flex-end"><button type="button" class="cv-btn" data-k="revert">Revert</button><button type="button" class="cv-btn" data-k="use">Use</button></div></div>`);
  private readonly now = this.root.querySelector('.cv-bp-now') as HTMLCanvasElement;
  private readonly rows = new Map<string, HTMLButtonElement>();
  private readonly heads = new Map<string, HTMLElement>();
  private readonly seen = new IntersectionObserver((hits) => {
    for (const h of hits) if (h.isIntersecting) { const row = h.target as HTMLButtonElement, p = allBrushPresets().find((x) => x.id === row.dataset.id); this.seen.unobserve(row); if (p) drawBrushStroke(row.querySelector('canvas') as HTMLCanvasElement, previewOfPreset(p)); }
  });
  private before: { brush: Engine['brush']; shape: Engine['brushShape']; dynamics: Engine['brushDynamics']; flow: number; id: string | null } | null = null;
  private readonly list = this.root.querySelector('.cv-bp-list') as HTMLElement;
  private readonly find = this.root.querySelector('[data-k="find"]') as HTMLInputElement;
  private readonly size = this.root.querySelector('[data-k="size"]') as HTMLInputElement;
  private readonly hard = this.root.querySelector('[data-k="hardness"]') as HTMLInputElement;

  constructor(private readonly engine: Engine) {
    document.body.appendChild(this.root);
    this.size.addEventListener('input', () => { engine.setBrush({ diameter: Number(this.size.value) }); this.sync(); });
    this.hard.addEventListener('input', () => { engine.setBrush({ hardness: Number(this.hard.value) / 100 }); this.sync(); });
    this.find.addEventListener('input', () => this.fill());
    (this.root.querySelector('[data-k="use"]') as HTMLElement).addEventListener('click', () => this.take());
    (this.root.querySelector('[data-k="revert"]') as HTMLElement).addEventListener('click', () => this.revert());
    document.addEventListener('pointerdown', (e) => { if (this.isOpen && !this.root.contains(e.target as Node)) this.take(); }, true);
    document.addEventListener('keydown', (e) => { if (!this.isOpen) return; if (e.key === 'Escape') this.revert(); else if (e.key === 'Enter' && document.activeElement !== this.find) this.take(); });
  }

  get isOpen(): boolean { return !this.root.hidden; }
  close(): void { setHidden(this.root, true); this.before = null; }

  private recent(): string[] {
    try { const v = JSON.parse(String(recalled('Brush Picker', 'recent') ?? '[]')); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : []; } catch { return []; }
  }

  /** Keeps the brush that is set, noting its preset as the latest used, and closes. */
  take(): void {
    const id = this.engine.brushPresetId;
    if (id && this.before && id !== this.before.id) remembered('Brush Picker', 'recent', JSON.stringify([id, ...this.recent().filter((x) => x !== id)].slice(0, 8)));
    this.close();
  }

  /** Puts back the brush that was set when the picker opened, and closes. */
  revert(): void {
    const b = this.before, e = this.engine;
    if (b) { e.setBrush({ ...b.brush }); e.brushShape = b.shape; e.brushDynamics = b.dynamics; e.brushFlow = b.flow; e.brushPresetId = b.id; e.emit('options', null); }
    this.close();
  }

  show(x: number, y: number): void {
    const e = this.engine;
    this.before = { brush: { ...e.brush }, shape: structuredClone(e.brushShape), dynamics: structuredClone(e.brushDynamics), flow: e.brushFlow, id: e.brushPresetId };
    this.find.value = '';
    this.fill();
    this.sync();
    setHidden(this.root, false);
    const r = this.root.getBoundingClientRect();
    this.root.style.left = `${Math.max(4, Math.min(x, window.innerWidth - r.width - 4))}px`;
    this.root.style.top = `${Math.max(4, Math.min(y, window.innerHeight - r.height - 4))}px`;
    this.find.focus();
  }

  private sync(): void {
    const b = this.engine.brush;
    this.size.value = String(Math.min(500, b.diameter));
    this.hard.value = String(Math.round(b.hardness * 100));
    setText(this.root.querySelector('[data-o="size"]') as HTMLElement, `${b.diameter} px`);
    setText(this.root.querySelector('[data-o="hardness"]') as HTMLElement, `${Math.round(b.hardness * 100)}%`);
    drawBrushStroke(this.now, previewOfEngine(this.engine));
  }

  private row(id: string, scope: string): HTMLButtonElement {
    const key = scope + id;
    let b = this.rows.get(key);
    if (b) return b;
    b = el<HTMLButtonElement>('<button type="button" class="cv-bp-item" style="display:grid;grid-template-columns:1fr auto;gap:2px 8px"><span></span><em></em><canvas width="228" height="26" style="grid-column:1 / 3;width:100%;height:26px;color:var(--text-primary)"></canvas></button>');
    b.dataset.id = id;
    b.addEventListener('click', () => { const p = allBrushPresets().find((x) => x.id === id); if (p) { this.engine.applyBrushPreset(p); this.sync(); this.mark(); } });
    b.addEventListener('dblclick', () => this.take());
    this.rows.set(key, b);
    this.seen.observe(b);
    return b;
  }

  private mark(): void { for (const b of this.rows.values()) b.classList.toggle('is-on', this.engine.brushPresetId === b.dataset.id); }

  private head(group: string): HTMLElement {
    let h = this.heads.get(group);
    if (!h) {
      h = el('<div class="cv-bp-group"></div>');
      setText(h, group.replace(/\//g, ' / '));
      h.style.paddingLeft = `${(group.split('/').length - 1) * 10}px`;
      this.heads.set(group, h);
    }
    return h;
  }

  private fill(): void {
    const q = this.find.value.trim().toLowerCase(), all = allBrushPresets(), ids = new Set(all.map((p) => p.id));
    for (const [k, b] of this.rows) if (!ids.has(b.dataset.id as string)) { b.remove(); this.seen.unobserve(b); this.rows.delete(k); }
    const order: string[] = [];
    for (const p of all) if (!order.includes(brushGroupOf(p))) order.push(brushGroupOf(p));
    const sorted = [...all].sort((a, b) => order.indexOf(brushGroupOf(a)) - order.indexOf(brushGroupOf(b)));
    const want: HTMLElement[] = [], put = (p: BrushPreset, scope: string): void => {
      const b = this.row(p.id, scope);
      setText(b.querySelector('span') as HTMLElement, p.name);
      setText(b.querySelector('em') as HTMLElement, `${p.diameter} px`);
      want.push(b);
    };
    const recent = q ? [] : this.recent().flatMap((id) => all.filter((p) => p.id === id));
    if (recent.length) { want.push(this.head('Recent')); for (const p of recent) put(p, 'r:'); }
    let group = '';
    for (const p of sorted) {
      if (q && !p.name.toLowerCase().includes(q)) continue;
      const g = brushGroupOf(p);
      if (g !== group) { group = g; want.push(this.head(g)); }
      put(p, '');
    }
    want.forEach((n, i) => { if (this.list.children[i] !== n) this.list.insertBefore(n, this.list.children[i] ?? null); });
    while (this.list.children.length > want.length) this.list.lastElementChild?.remove();
    this.mark();
  }
}
