import { createSurface, ctxOf, type Engine, type Pt, type Surface } from '../engine';
import { levelsOf } from '../engine/matte';
import { DEFAULT_REFINE, edgeZone, refineRegion, refineSelection, type RefineSettings } from '../engine/select-mask';
import { setDialogTool } from '../extensions/dialog-tool';
import type { Tool, ToolContext, ToolPointer } from '../extensions/registry';
import { el } from './dom';
import { icon } from './icons';
import { checkRow, selectRow, sliderRow } from './panels/controls';
import { toast } from './toast';

const PREVIEW_SIDE = 1024;
const UNDO_DEPTH = 8;
type View = 'onionSkin' | 'marchingAnts' | 'overlay' | 'onBlack' | 'onWhite' | 'blackWhite' | 'onLayers';
type Output = 'selection' | 'mask' | 'layer' | 'layerMask' | 'document' | 'documentMask';
type Which = 'quick' | 'refine' | 'brush' | 'hand' | 'zoom';
type Dab = 'refine' | 'erase' | 'add' | 'sub';

const TOOLS: ReadonlyArray<readonly [Which, string, string, string, string]> = [
  ['quick', 'Quick Selection', 'W', 'tQuickSelect', 'Drag over the part to add to the selection; Alt takes away. The stroke stays on tones like the first one.'],
  ['refine', 'Refine Edge Brush', 'R', 'tRefineEdge', 'Paint along hair, fur or soft edges to work the edge out again from the picture; Alt erases the marks.'],
  ['brush', 'Brush', 'B', 'tBrush', 'Paint to add to the selection; Alt takes away. [ and ] change the size.'],
  ['hand', 'Hand', 'H', 'tHand', 'Drag to move the picture.'],
  ['zoom', 'Zoom', 'Z', 'tZoom', 'Click to zoom in; Alt zooms out.'],
];

/** Select > Select and Mask as a workspace on the main canvas (the Stage keeps its canvases): the refined selection is drawn
 *  live by a tool lent to the Stage, the tools sit in a strip over the toolbar's place, the properties in a panel over the
 *  dock's, and the rest of the window is hidden or disabled by one class on the app root. Both bars build once. */
export class SelectMaskWorkspace {
  private s: RefineSettings = { ...DEFAULT_REFINE };
  private view: View = 'overlay';
  private opacity = 50;
  private output: Output = 'selection';
  private showEdge = false;
  private decon = false;
  private deconAmount = 100;
  private active: Which = 'refine';
  private brushSize = 40;
  private live = false;
  private project: unknown = null;
  private scale = 1;
  private pw = 1;
  private ph = 1;
  private image: ImageData | null = null;
  private guide: Float32Array | null = null;
  private mask: Float32Array | null = null;
  private region: Float32Array | null = null;
  private adds: Float32Array | null = null;
  private subs: Float32Array | null = null;
  private out: ImageData | null = null;
  private surface: Surface | null = null;
  private undo: Array<[Float32Array, Float32Array, Float32Array]> = [];
  private stroke: { last: Pt; kind: Dab; hard: boolean; tone: number | null } | null = null;
  private panning: Pt | null = null;
  private at: Pt | null = null;
  private frame = 0;
  private readonly app: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly buttons = new Map<Which, HTMLElement>();
  private syncRows: () => void = () => undefined;
  private fadeRow: HTMLElement | null = null;
  private readonly tool: Tool;

  constructor(private readonly engine: Engine, root: HTMLElement) {
    this.app = root.classList.contains('cv-app') ? root : root.querySelector<HTMLElement>('.cv-app') ?? root;
    this.strip = el('<div class="cv-selmask-tools" role="toolbar" aria-label="Select and Mask tools" hidden></div>');
    for (const [id, label, key, ic] of TOOLS) {
      const b = el(`<button class="cv-tool" type="button" title="${label} (${key})" aria-label="${label}">${icon(ic, 18)}</button>`);
      b.addEventListener('click', () => this.pick(id));
      this.buttons.set(id, b);
      this.strip.append(b);
    }
    this.panel = el('<aside class="cv-selmask-panel" aria-label="Select and Mask properties" hidden><div class="cv-selmask-head">Select and Mask</div><div class="cv-selmask-body"></div><div class="cv-selmask-foot"></div></aside>');
    const body = this.panel.querySelector('.cv-selmask-body') as HTMLElement, foot = this.panel.querySelector('.cv-selmask-foot') as HTMLElement;
    const sec = (t: string): HTMLElement => el(`<div class="cv-selmask-sec">${t}</div>`);
    const viewRow = selectRow('View Mode', [['onionSkin', 'Onion Skin'], ['marchingAnts', 'Marching Ants'], ['overlay', 'Overlay'], ['onBlack', 'On Black'], ['onWhite', 'On White'], ['blackWhite', 'Black & White'], ['onLayers', 'On Layers']], (v) => { this.view = v as View; this.syncFade(); this.render(); });
    const fade = sliderRow('Opacity (%)', 0, 100, 1, (v) => { this.opacity = v; this.render(); });
    this.fadeRow = fade.el;
    const edgeRow = checkRow('Show Edge', (v) => { this.showEdge = v; this.render(); });
    const sizeRow = sliderRow('Brush Size (px)', 2, 400, 1, (v) => { this.brushSize = v; this.engine.emit('overlay', null); });
    const radius = sliderRow('Radius (px)', 0, 100, 1, (v) => { this.s = { ...this.s, radius: v }; this.render(); });
    const smart = checkRow('Smart Radius', (v) => { this.s = { ...this.s, smart: v }; this.render(); });
    const smooth = sliderRow('Smooth', 0, 100, 1, (v) => { this.s = { ...this.s, smooth: v }; this.render(); });
    const feather = sliderRow('Feather (px)', 0, 100, 1, (v) => { this.s = { ...this.s, feather: v }; this.render(); });
    const contrast = sliderRow('Contrast (%)', 0, 100, 1, (v) => { this.s = { ...this.s, contrast: v }; this.render(); });
    const shift = sliderRow('Shift Edge (px)', -20, 20, 1, (v) => { this.s = { ...this.s, shift: v }; this.render(); });
    const outRow = selectRow('Output To', [['selection', 'Selection'], ['mask', 'Layer Mask'], ['layer', 'New Layer'], ['layerMask', 'New Layer with Layer Mask'], ['document', 'New Document'], ['documentMask', 'New Document with Layer Mask']], (v) => { this.output = v as Output; });
    const deconRow = checkRow('Decontaminate Colors', (v) => {
      this.decon = v;
      if (v && (this.output === 'selection' || this.output === 'mask')) { this.output = 'layerMask'; outRow.set(this.output); }
    });
    const amount = sliderRow('Amount (%)', 0, 100, 1, (v) => { this.deconAmount = v; });
    body.append(viewRow.el, fade.el, edgeRow.el, sec('Tool'), sizeRow.el, sec('Edge Detection'), radius.el, smart.el, sec('Global Refinements'), smooth.el, feather.el, contrast.el, shift.el, sec('Output Settings'), deconRow.el, amount.el, outRow.el);
    const cancel = el('<button class="cv-btn cv-btn-ghost" type="button">Cancel</button>'), ok = el('<button class="cv-btn cv-btn-primary" type="button">OK</button>');
    cancel.addEventListener('click', () => this.leave());
    ok.addEventListener('click', () => this.commit());
    foot.append(cancel, ok);
    this.syncRows = () => {
      viewRow.set(this.view); fade.set(this.opacity); edgeRow.set(this.showEdge); sizeRow.set(this.brushSize);
      radius.set(this.s.radius); smart.set(!!this.s.smart); smooth.set(this.s.smooth); feather.set(this.s.feather); contrast.set(this.s.contrast); shift.set(this.s.shift);
      deconRow.set(this.decon); amount.set(this.deconAmount); outRow.set(this.output);
    };
    this.app.append(this.strip, this.panel);
    this.tool = this.makeTool();
    this.engine.on('doc', () => { if (this.live && this.engine.current !== this.project) this.leave(); });
  }

  /** Opens the workspace; false when it cannot (the caller then opens the dialog) after saying why. */
  enter(): boolean {
    const p = this.engine.current;
    if (this.live) return true;
    if (!p) return true;
    if (!p.selection) { toast('Make a selection first, then refine it here.'); return true; }
    if (p.doc.depth === 32) { toast('Select and Mask opens as a dialog on a 32 bit per channel document; its workspace refines an 8 or 16 bit picture.'); return false; }
    this.engine.settle();
    const flat = this.engine.flattened();
    if (!flat) { toast('Select and Mask opens as a dialog here: the picture could not be read for the workspace.'); return false; }
    const W = p.doc.width, H = p.doc.height, sel = p.selection;
    this.scale = Math.min(1, PREVIEW_SIDE / Math.max(W, H));
    this.pw = Math.max(1, Math.round(W * this.scale)); this.ph = Math.max(1, Math.round(H * this.scale));
    const small = createSurface(this.pw, this.ph);
    ctxOf(small).drawImage(flat, 0, 0, this.pw, this.ph);
    this.image = ctxOf(small).getImageData(0, 0, this.pw, this.ph);
    this.guide = levelsOf(this.image, true);
    const ms = createSurface(this.pw, this.ph), mc = ctxOf(ms);
    mc.drawImage(sel.surface(), sel.x * this.scale, sel.y * this.scale, sel.w * this.scale, sel.h * this.scale);
    const md = mc.getImageData(0, 0, this.pw, this.ph).data, n = this.pw * this.ph;
    this.mask = new Float32Array(n);
    for (let i = 0; i < n; i++) this.mask[i] = md[i * 4 + 3] / 255;
    this.region = new Float32Array(n); this.adds = new Float32Array(n); this.subs = new Float32Array(n);
    this.undo = [];
    this.out = new ImageData(this.pw, this.ph);
    this.surface = createSurface(this.pw, this.ph);
    this.project = p;
    this.live = true;
    this.syncRows(); this.syncFade(); this.pick(this.active);
    this.strip.hidden = false; this.panel.hidden = false;
    this.app.classList.add('is-selmask');
    setDialogTool(this.tool);
    window.addEventListener('keydown', this.key, true);
    this.paintView();
    return true;
  }

  private leave(): void {
    if (!this.live) return;
    this.live = false;
    window.removeEventListener('keydown', this.key, true);
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.stroke = null; this.panning = null; this.at = null;
    setDialogTool(null);
    this.app.classList.remove('is-selmask');
    this.strip.hidden = true; this.panel.hidden = true;
    this.image = null; this.guide = null; this.mask = null; this.region = null; this.adds = null; this.subs = null; this.out = null; this.surface = null; this.undo = [];
    this.project = null;
    this.engine.emit('overlay', null);
  }

  private pick(w: Which): void {
    this.active = w;
    for (const [id, b] of this.buttons) b.classList.toggle('is-active', id === w);
    this.engine.emit('overlay', null);
  }

  private syncFade(): void {
    const used = this.view === 'onionSkin' || this.view === 'overlay' || this.view === 'onBlack' || this.view === 'onWhite';
    this.fadeRow?.classList.toggle('is-off', !used);
  }

  private readonly key = (e: KeyboardEvent): void => {
    if (!this.live) return;
    const t = e.target as HTMLElement | null, typing = !!t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range'));
    const stop = (): void => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.key === 'Escape') { stop(); this.leave(); return; }
    if (typing) return;
    if (e.key === 'Enter') { stop(); this.commit(); return; }
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (k === 'z' && !e.shiftKey) { stop(); this.takeBack(); return; }
      if (['0', '1', '+', '-', '='].includes(e.key)) return;
      stop();
      return;
    }
    if (e.altKey) { if (k !== 'alt') stop(); return; }
    const hit = TOOLS.find((x) => x[2].toLowerCase() === k);
    if (hit) { stop(); this.pick(hit[0]); return; }
    if (e.key === '[' || e.key === ']') { stop(); this.brushSize = Math.max(2, Math.min(400, Math.round(this.brushSize * (e.key === ']' ? 1.2 : 1 / 1.2)))); this.syncRows(); this.engine.emit('overlay', null); return; }
    if (e.key.length === 1 && k !== ' ') stop();
  };

  private takeBack(): void {
    const s = this.undo.pop();
    if (!s || !this.region || !this.adds || !this.subs) return;
    this.region.set(s[0]); this.adds.set(s[1]); this.subs.set(s[2]);
    this.render();
  }

  private makeTool(): Tool {
    const hints = new Map(TOOLS.map((x) => [x[0], x[4]]));
    return {
      id: 'idle', label: 'Select and Mask', key: '', order: 0, hidden: true,
      icon: () => 'move',
      hint: () => hints.get(this.active) ?? '',
      cursor: () => (this.active === 'hand' ? (this.panning ? 'grabbing' : 'grab') : this.active === 'zoom' ? 'zoom-in' : 'crosshair'),
      down: (ctx, p) => this.down(ctx, p),
      move: (ctx, p) => this.move(ctx, p),
      up: (ctx, p) => this.up(ctx, p),
      hover: (ctx, p) => { this.at = p ? p.screen : null; if (this.active !== 'hand' && this.active !== 'zoom') ctx.engine.emit('overlay', null); },
      cancel: () => { this.stroke = null; this.panning = null; },
      overlay: (ctx, g) => this.drawOverlay(ctx, g),
    };
  }

  private down(ctx: ToolContext, p: ToolPointer): void {
    if (p.button !== 0 || !this.live) return;
    if (this.active === 'hand') { ctx.engine.stopFlick(); this.panning = p.screen; return; }
    if (this.active === 'zoom') { const z = ctx.view().zoom; ctx.engine.zoomTo(p.alt ? z / 2 : z * 2, p.screen); return; }
    if (!this.region || !this.adds || !this.subs || !this.guide) return;
    this.undo.push([new Float32Array(this.region), new Float32Array(this.adds), new Float32Array(this.subs)]);
    if (this.undo.length > UNDO_DEPTH) this.undo.shift();
    const kind: Dab = this.active === 'refine' ? (p.alt ? 'erase' : 'refine') : p.alt ? 'sub' : 'add';
    const x = Math.min(this.pw - 1, Math.max(0, Math.floor(p.doc.x * this.scale))), y = Math.min(this.ph - 1, Math.max(0, Math.floor(p.doc.y * this.scale)));
    this.stroke = { last: p.doc, kind, hard: this.active === 'brush', tone: this.active === 'quick' ? this.guide[y * this.pw + x] : null };
    this.dab(p.doc);
    this.render();
  }

  private move(ctx: ToolContext, p: ToolPointer): void {
    this.at = p.screen;
    if (this.panning) { ctx.engine.pan(p.screen.x - this.panning.x, p.screen.y - this.panning.y); this.panning = p.screen; return; }
    const st = this.stroke;
    if (!st) return;
    const r = Math.max(1, (this.brushSize / 2) * this.scale), gap = Math.max(1, r * 0.25) / this.scale;
    const dx = p.doc.x - st.last.x, dy = p.doc.y - st.last.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / gap));
    for (let i = 1; i <= n; i++) this.dab({ x: st.last.x + (dx * i) / n, y: st.last.y + (dy * i) / n });
    st.last = p.doc;
    this.render();
    ctx.engine.emit('overlay', null);
  }

  private up(_ctx: ToolContext, _p: ToolPointer): void { this.stroke = null; this.panning = null; }

  /** One soft round dab at a document point, in preview pixels (the brush size is in document pixels). */
  private dab(at: Pt): void {
    const st = this.stroke, region = this.region, adds = this.adds, subs = this.subs, guide = this.guide;
    if (!st || !region || !adds || !subs || !guide) return;
    const px = at.x * this.scale, py = at.y * this.scale, r = Math.max(1, (this.brushSize / 2) * this.scale), pw = this.pw;
    for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(this.ph - 1, Math.ceil(py + r)); y++) {
      for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(pw - 1, Math.ceil(px + r)); x++) {
        const d = Math.hypot(x - px, y - py) / r;
        if (d >= 1) continue;
        const i = y * pw + x;
        let w = st.hard ? Math.min(1, (1 - d) * 4) : 1 - d * d;
        if (st.tone !== null) w *= Math.max(0, 1 - Math.abs(guide[i] - st.tone) / 0.3);
        if (w <= 0) continue;
        if (st.kind === 'refine') region[i] = Math.max(region[i], w);
        else if (st.kind === 'erase') region[i] = Math.max(0, region[i] - w);
        else if (st.kind === 'add') { adds[i] = Math.max(adds[i], w); subs[i] *= 1 - w; }
        else { subs[i] = Math.max(subs[i], w); adds[i] *= 1 - w; }
      }
    }
  }

  private drawOverlay(ctx: ToolContext, g: CanvasRenderingContext2D): void {
    const p = this.engine.current;
    if (!this.live || !p || !this.surface) return;
    const v = ctx.view(), a = v.toScreen({ x: 0, y: 0 });
    g.save();
    g.imageSmoothingEnabled = true;
    g.drawImage(this.surface as CanvasImageSource, a.x, a.y, p.doc.width * v.zoom, p.doc.height * v.zoom);
    if ((this.active === 'quick' || this.active === 'refine' || this.active === 'brush') && this.at) {
      const pal = ctx.paint(), r = (this.brushSize / 2) * v.zoom;
      g.beginPath(); g.arc(this.at.x, this.at.y, Math.max(1, r), 0, Math.PI * 2);
      g.lineWidth = 3; g.strokeStyle = pal.antsB; g.stroke();
      g.lineWidth = 1; g.strokeStyle = pal.antsA; g.stroke();
    }
    g.restore();
  }

  private render(): void {
    if (this.frame || !this.live) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.paintView(); });
  }

  /** The refined edge with the Add and Subtract strokes laid over it (the arrays at the same size as `m`). */
  private stroked(m: Float32Array, adds: Float32Array | null, subs: Float32Array | null): Float32Array {
    if (!adds || !subs || !(adds.some((v) => v > 0) || subs.some((v) => v > 0))) return m;
    const out = new Float32Array(m.length);
    for (let i = 0; i < m.length; i++) out[i] = Math.max(m[i] * (1 - subs[i]), adds[i]);
    return out;
  }

  /** The picture in the chosen view mode into the surface the lent tool draws. */
  private paintView(): void {
    const img = this.image, guide = this.guide, mask = this.mask, out = this.out, surf = this.surface;
    if (!this.live || !img || !guide || !mask || !out || !surf) return;
    const pw = this.pw, ph = this.ph, s = img.data, d = out.data, u = this.opacity / 100, view = this.view;
    const m0 = refineSelection(mask, guide, pw, ph, this.s, this.scale);
    const m = this.stroked(this.region ? refineRegion(m0, guide, this.region, pw, ph, this.s.radius, this.scale) : m0, this.adds, this.subs);
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = y * pw + x, k = i * 4, a = m[i];
        d[k + 3] = 255;
        if (view === 'onionSkin' || view === 'onLayers') {
          const vis = view === 'onionSkin' ? a + (1 - a) * (1 - u) : a, bg = ((x >> 3) + (y >> 3)) % 2 ? 204 : 255;
          d[k] = Math.round(s[k] * vis + bg * (1 - vis)); d[k + 1] = Math.round(s[k + 1] * vis + bg * (1 - vis)); d[k + 2] = Math.round(s[k + 2] * vis + bg * (1 - vis));
        } else if (view === 'marchingAnts') {
          const inside = a >= 0.5, edge = (x > 0 && (m[i - 1] >= 0.5) !== inside) || (y > 0 && (m[i - pw] >= 0.5) !== inside), ant = ((x + y) >> 2) % 2 ? 0 : 255;
          d[k] = edge ? ant : s[k]; d[k + 1] = edge ? ant : s[k + 1]; d[k + 2] = edge ? ant : s[k + 2];
        } else if (view === 'blackWhite') {
          const v = Math.round(a * 255);
          d[k] = d[k + 1] = d[k + 2] = v;
        } else if (view === 'overlay') {
          const c = (1 - a) * u;
          d[k] = Math.round(s[k] * (1 - c) + 255 * c); d[k + 1] = Math.round(s[k + 1] * (1 - c)); d[k + 2] = Math.round(s[k + 2] * (1 - c));
        } else {
          const c = (1 - a) * u, bg = view === 'onWhite' ? 255 : 0;
          d[k] = Math.round(s[k] * (1 - c) + bg * c); d[k + 1] = Math.round(s[k + 1] * (1 - c) + bg * c); d[k + 2] = Math.round(s[k + 2] * (1 - c) + bg * c);
        }
      }
    }
    if (this.showEdge) {
      const zone = edgeZone(mask, pw, ph, this.s.radius, this.scale);
      for (let i = 0; i < zone.length; i++) if (zone[i]) { const k = i * 4; d[k] = Math.round(d[k] * 0.55); d[k + 1] = Math.round(d[k + 1] * 0.55 + 90); d[k + 2] = Math.round(d[k + 2] * 0.55 + 115); }
    }
    ctxOf(surf).putImageData(out, 0, 0);
    this.engine.emit('overlay', null);
  }

  /** OK: the refinement at full resolution (the preview's strokes carried up), sent to the chosen output as one history step. */
  private commit(): void {
    const p = this.engine.current, sel = p?.selection, flat = this.engine.flattened(), s = { ...this.s }, output = this.output;
    const adds = this.adds, subs = this.subs, region = this.region, pw = this.pw, ph = this.ph, scale = this.scale, decon = this.decon ? this.deconAmount : 0;
    this.leave();
    if (!p || !sel || !flat) return;
    const W = p.doc.width, H = p.doc.height, guide = levelsOf(ctxOf(flat).getImageData(0, 0, W, H), true), mask = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = sel.valueAt(x, y) / 255;
    let m = refineSelection(mask, guide, W, H, s, 1);
    const up = (a: Float32Array): Float32Array => { const f = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f[y * W + x] = a[Math.min(ph - 1, Math.floor(y * scale)) * pw + Math.min(pw - 1, Math.floor(x * scale))]; return f; };
    if (region?.some((v) => v > 0)) m = refineRegion(m, guide, up(region), W, H, s.radius, 1);
    if (adds && subs && (adds.some((v) => v > 0) || subs.some((v) => v > 0))) m = this.stroked(m, up(adds), up(subs));
    const data = new Uint8Array(W * H);
    for (let i = 0; i < data.length; i++) data[i] = Math.round(Math.min(1, Math.max(0, m[i])) * 255);
    if (output === 'document' || output === 'documentMask') this.engine.applyRefinedToDocument(data, output === 'documentMask');
    else this.engine.applyRefinedSelection(data, output, decon);
  }
}
