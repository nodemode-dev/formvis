import type { Engine, ID } from '../../engine';
import type { P2, Quad } from '../../engine/perspective';
import { connectedQuad, estimateFocal, makePlane, pasteInPerspective, rectFor, stampInPerspective, toImage, toPlane, type PlaneMap, type PlaneRect } from '../../engine/vanishing';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { selectRow, sliderRow } from './controls';

const PW = 720, PH = 480;
type Tool = 'create' | 'edit' | 'paste' | 'stamp';

/** Filter > Vanishing Point (1.58.3, the parity plan's L6): Create Plane by clicking its four corners
 *  (top left, top right, bottom right, bottom left), Edit Plane by dragging them, a grid showing its perspective;
 *  Paste places another layer on the plane in perspective (drag it along the plane, Size sets how much of the plane it
 *  covers); Stamp clones in perspective (Alt-click a source on the plane, then paint). The layer is worked on a copy;
 *  OK applies it as one step, Cancel leaves the layer as it was. Rows and the preview are built once. */
export class VanishingPointDialog extends Dialog {
  private readonly view = el(`<canvas width="${PW}" height="${PH}" style="display: block; width: ${PW}px; height: ${PH}px; background: var(--surface-2, #222); cursor: crosshair; touch-action: none"></canvas>`) as HTMLCanvasElement;
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 2.8em"></p>');
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
  private readonly source = selectRow('Paste from', [], (v) => { this.pasteFrom = v; });
  private tool: Tool = 'create';
  /** Every plane of the picture; `cur` is the one the tools work on. A connected plane keeps its parent and angle. */
  private planes: Array<{ corners: P2[]; plane: PlaneMap | null; parent?: number; angle?: number; depth?: number }> = [{ corners: [], plane: null }];
  private cur = 0;
  private readonly planeRow = selectRow('Plane', [], (v) => { this.pick(Number(v)); });
  private readonly angleRow = sliderRow('Child angle (degrees)',-90, 90, 1, (v) => { this.setAngle(v); });
  private readonly depthRow = sliderRow('Child depth (% of plane width)', -100, 100, 1, (v) => { this.setDepth(v); });
  /** The focal length in pixels set by hand for the connected planes; null follows what the plane implies. */
  private focalPx: number | null = null;
  private readonly focalRow = sliderRow('Focal length (mm, 35 mm equivalent)', 8, 300, 1, (v) => { this.setFocal(v); });
  private get corners(): P2[] { return this.planes[this.cur].corners; }
  private set corners(v: P2[]) { this.planes[this.cur].corners = v; }
  private get plane(): PlaneMap | null { return this.planes[this.cur].plane; }
  private set plane(v: PlaneMap | null) { this.planes[this.cur].plane = v; }
  private work: ImageData | null = null;
  private readonly workCanvas = document.createElement('canvas');
  private layerId: ID | null = null;
  private fit = { k: 1, ox: 0, oy: 0 };
  private pasteFrom = '';
  private paste: { img: ImageData; rect: PlaneRect } | null = null;
  private pasteSize = 0.4;
  private stampSource: P2 | null = null;
  private stroke: { from: ImageData; offset: P2; last: P2 } | null = null;
  private brush = 40;
  private hardness = 0.5;
  private stampOpacity = 1;
  private drag: { corner: number } | { grab: P2; at: P2 } | null = null;

  constructor(private readonly engine: Engine) {
    super('Vanishing Point', PW + 48);
    const bar = el('<div class="cv-seg" role="group" aria-label="Vanishing Point tools" style="margin-bottom: 8px"></div>');
    for (const [t, label] of [['create', 'Create Plane'], ['edit', 'Edit Plane'], ['paste', 'Paste'], ['stamp', 'Stamp']] as const) {
      const b = el(`<button class="cv-btn cv-btn-ghost" type="button">${label}</button>`) as HTMLButtonElement;
      b.addEventListener('click', () => this.setTool(t));
      this.toolButtons.set(t, b); bar.appendChild(b);
    }
    const size = sliderRow('Paste size (% of the plane)', 5, 100, 1, (v) => { this.pasteSize = v / 100; this.resizePaste(); });
    const brush = sliderRow('Stamp brush (px)', 2, 300, 1, (v) => { this.brush = v; });
    const hard = sliderRow('Stamp hardness (%)', 0, 100, 1, (v) => { this.hardness = v / 100; });
    const flow = sliderRow('Stamp opacity (%)', 1, 100, 1, (v) => { this.stampOpacity = v / 100; });
    const add = el('<button class="cv-btn cv-btn-ghost" type="button">New plane</button>') as HTMLButtonElement;
    add.addEventListener('click', () => { this.commitPaste(); this.addPlane({ corners: [], plane: null }); this.setTool('create'); });
    const child = el('<button class="cv-btn cv-btn-ghost" type="button">Connected plane</button>') as HTMLButtonElement;
    child.addEventListener('click', () => this.addConnected());
    const del = el('<button class="cv-btn cv-btn-ghost" type="button">Delete plane</button>') as HTMLButtonElement;
    del.addEventListener('click', () => this.deletePlane());
    const planeBar = el('<div class="cv-row-actions"></div>');
    planeBar.append(add, child, del);
    const estimate = el('<button class="cv-btn cv-btn-ghost" type="button">Estimate focal length</button>') as HTMLButtonElement;
    estimate.addEventListener('click', () => { this.focalPx = null; this.rebuildChildren(); this.syncPlanes(); this.render(); });
    planeBar.append(estimate);
    this.body.append(bar, this.view, this.planeRow.el, planeBar, this.angleRow.el, this.depthRow.el, this.focalRow.el, this.source.el, size.el, brush.el, hard.el, flow.el, this.note);
    size.set(40); brush.set(40); hard.set(50); flow.set(100); this.angleRow.set(0); this.depthRow.set(0); this.focalRow.set(50);
    this.view.addEventListener('pointerdown', (e) => this.down(e));
    this.view.addEventListener('pointermove', (e) => this.move(e));
    this.view.addEventListener('pointerup', () => { this.drag = null; this.stroke = null; this.render(); });
    this.button('Cancel', 'ghost', () => { this.release(); this.close(); });
    this.button('OK', 'primary', () => this.apply());
    this.remember(Array.from(this.source.el.querySelectorAll('select')));   // the layers to paste from are this document's
  }

  show(): void {
    const p = this.engine.current, l = p?.activeLayer;
    if (!p || !l?.raster || l.isGroup || l.adjustment || l.text || l.shape || l.smart) { this.engine.notice('Select a pixel layer first.'); return; }
    this.layerId = l.id; this.work = l.raster.read();
    this.workCanvas.width = this.work.width; this.workCanvas.height = this.work.height;
    (this.workCanvas.getContext('2d') as CanvasRenderingContext2D).putImageData(this.work, 0, 0);
    const k = Math.min(1, PW / this.work.width, PH / this.work.height);
    this.fit = { k, ox: Math.floor((PW - this.work.width * k) / 2), oy: Math.floor((PH - this.work.height * k) / 2) };
    const others = p.doc.layers.filter((x) => x.raster && x.id !== l.id && !x.isGroup && !x.adjustment);
    const sel = this.source.el.querySelector('select') as HTMLSelectElement;
    sel.replaceChildren(...others.map((x) => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.name; return o; }));
    this.pasteFrom = others[others.length - 1]?.id ?? ''; if (this.pasteFrom) sel.value = this.pasteFrom;
    this.planes = [{ corners: [], plane: null }]; this.cur = 0; this.paste = null; this.stampSource = null; this.focalPx = null;
    this.syncPlanes();
    this.setTool('create');
    this.open();
  }

  /** The plane list in the select, patched in place, and the angle slider following the plane in hand. */
  private syncPlanes(): void {
    const sel = this.planeRow.el.querySelector('select') as HTMLSelectElement;
    while (sel.options.length > this.planes.length) sel.remove(sel.options.length - 1);
    while (sel.options.length < this.planes.length) sel.add(new Option('', String(sel.options.length)));
    this.planes.forEach((p, i) => { sel.options[i].textContent = `Plane ${i + 1}${p.parent !== undefined ? ` (connected to ${p.parent + 1})` : ''}`; });
    sel.value = String(this.cur);
    this.angleRow.set(this.planes[this.cur].angle ?? 0);
    this.depthRow.set(Math.round((this.planes[this.cur].depth ?? 0) * 100));
    for (const row of [this.angleRow, this.depthRow]) for (const i of row.el.querySelectorAll('input')) i.disabled = this.planes[this.cur].parent === undefined;
    const w = this.work, root = this.plane ?? this.planes.find((p) => p.plane)?.plane ?? null;
    if (w && root) this.focalRow.set(Math.round(this.mmOf(this.focalPx ?? estimateFocal(root, w.width, w.height), w)));
  }

  private mmOf(px: number, w: ImageData): number { return (px / Math.hypot(w.width, w.height)) * 43.27; }

  /** The focal length typed in, 35 mm equivalent, kept for every connected plane. */
  private setFocal(mm: number): void {
    const w = this.work;
    if (!w) return;
    this.focalPx = (mm / 43.27) * Math.hypot(w.width, w.height);
    this.rebuildChildren();
    this.render();
  }

  private setDepth(pct: number): void {
    const me = this.planes[this.cur];
    if (me.parent === undefined) return;
    me.depth = pct / 100;
    this.rebuildChildren();
    if (this.paste) this.resizePaste(); else this.render();
  }

  /** The corners of the connected plane `q` from its parent, with the focal length and depth in force. */
  private childQuad(q: { parent?: number; angle?: number; depth?: number }): Quad | null {
    const w = this.work, parent = q.parent !== undefined ? this.planes[q.parent]?.plane : null;
    return w && parent ? connectedQuad(parent, w.width, w.height, q.angle ?? 0, { focal: this.focalPx, depth: q.depth ?? 0 }) : null;
  }

  /** Every connected plane carried again from its parent, parents first. */
  private rebuildChildren(): void {
    this.planes.forEach((q) => {
      if (q.parent === undefined) return;
      const quad = this.childQuad(q), made = quad ? makePlane(quad) : null;
      if (quad && made) { q.corners = quad.map((c) => [c[0], c[1]] as P2); q.plane = made; }
    });
  }

  private addPlane(p: { corners: P2[]; plane: PlaneMap | null; parent?: number; angle?: number; depth?: number }): void {
    this.planes.push(p); this.cur = this.planes.length - 1; this.stampSource = null; this.syncPlanes();
  }

  private pick(i: number): void {
    if (!(i >= 0 && i < this.planes.length) || i === this.cur) return;
    this.commitPaste(); this.cur = i; this.stampSource = null; this.syncPlanes();
    this.setTool(this.plane ? (this.tool === 'create' ? 'edit' : this.tool) : 'create');
  }

  /** A plane hinged on the right edge of the one in hand (its corners 2 and 3), flat to start. */
  private addConnected(): void {
    const parent = this.plane, w = this.work;
    if (!parent || !w) { setText(this.note, 'Create a plane first; a connected plane grows from its right edge.'); return; }
    const quad = this.childQuad({ parent: this.cur, angle: 0, depth: 0 }), made = quad ? makePlane(quad) : null;
    if (!quad || !made) { setText(this.note, 'A connected plane does not fit past this edge.'); return; }
    this.commitPaste();
    this.addPlane({ corners: quad.map((c) => [c[0], c[1]] as P2), plane: made, parent: this.cur, angle: 0, depth: 0 });
    this.setTool('edit');
  }

  /** The connected plane in hand turned to `deg` out of its parent. */
  private setAngle(deg: number): void {
    const me = this.planes[this.cur], parent = me.parent !== undefined ? this.planes[me.parent]?.plane : null, w = this.work;
    if (!parent || !w) return;
    me.angle = deg;
    const quad = this.childQuad(me), made = quad ? makePlane(quad) : null;
    if (!quad || !made) { setText(this.note, 'That angle puts the plane behind the camera.'); return; }
    me.corners = quad.map((c) => [c[0], c[1]] as P2); me.plane = made;
    if (this.paste) this.resizePaste(); else this.render();
  }

  private deletePlane(): void {
    if (this.planes.length < 2) { this.planes = [{ corners: [], plane: null }]; this.cur = 0; }
    else {
      this.commitPaste();
      const gone = this.cur;
      this.planes.splice(gone, 1);
      for (const p of this.planes) { if (p.parent === gone) { p.parent = undefined; p.angle = undefined; } else if (p.parent !== undefined && p.parent > gone) p.parent -= 1; }
      this.cur = Math.min(gone, this.planes.length - 1);
    }
    this.stampSource = null; this.syncPlanes(); this.setTool(this.plane ? 'edit' : 'create');
  }

  private setTool(t: Tool): void {
    if (t !== 'paste') this.commitPaste();
    if ((t === 'paste' || t === 'stamp' || t === 'edit') && !this.plane) { setText(this.note, 'Create a plane first: click its four corners in turn (top left, top right, bottom right, bottom left).'); t = 'create'; }
    this.tool = t;
    for (const [k, b] of this.toolButtons) b.classList.toggle('is-active', k === t);
    if (t === 'paste' && !this.paste) this.startPaste();
    setText(this.note, { create: 'Click the plane\'s four corners in turn: top left, top right, bottom right, bottom left.', edit: 'Drag a corner to fit the plane to the surface.', paste: this.paste ? 'Drag the pasted picture along the plane; Size sets how much of the plane it covers.' : 'There is no other pixel layer to paste.', stamp: this.stampSource ? 'Paint to clone in perspective; Alt-click to choose another source.' : 'Alt-click a source on the plane, then paint.' }[t]);
    this.render();
  }

  private at(e: PointerEvent): P2 { const r = this.view.getBoundingClientRect(); return [(e.clientX - r.left - this.fit.ox) / this.fit.k, (e.clientY - r.top - this.fit.oy) / this.fit.k]; }

  private down(e: PointerEvent): void {
    if (!this.work) return;
    this.view.setPointerCapture(e.pointerId);
    const pt = this.at(e);
    if (this.tool === 'create') {
      this.corners.push(pt);
      if (this.corners.length === 4) {
        this.plane = makePlane(this.corners as Quad);
        if (!this.plane) { this.corners = []; setText(this.note, 'Those corners do not make a plane: click them in turn, top left, top right, bottom right, bottom left.'); }
        else { this.syncPlanes(); this.setTool('edit'); return; }
      }
      this.render();
    } else if (this.tool === 'edit') {
      let best = -1, bd = 12 / this.fit.k, on = this.cur;
      this.planes.forEach((q, n) => q.corners.forEach((c, i) => { const d = Math.hypot(c[0] - pt[0], c[1] - pt[1]); if (d < bd || (d === bd && n === this.cur)) { bd = d; best = i; on = n; } }));
      if (best >= 0) { if (on !== this.cur) { this.commitPaste(); this.cur = on; this.stampSource = null; this.syncPlanes(); } this.drag = { corner: best }; }
    } else if (this.tool === 'paste' && this.paste && this.plane) {
      const [u, v] = toPlane(this.plane, pt[0], pt[1]), r = this.paste.rect;
      if (u >= r.u && u <= r.u + r.du && v >= r.v && v <= r.v + r.dv) this.drag = { grab: [u, v], at: [r.u, r.v] };
    } else if (this.tool === 'stamp' && this.plane) {
      const [u, v] = toPlane(this.plane, pt[0], pt[1]);
      if (e.altKey) { this.stampSource = [u, v]; this.setTool('stamp'); return; }
      if (!this.stampSource) { setText(this.note, 'Alt-click a source on the plane first.'); return; }
      this.stroke = { from: new ImageData(new Uint8ClampedArray(this.work.data), this.work.width, this.work.height), offset: [u - this.stampSource[0], v - this.stampSource[1]], last: pt };
      this.dab(pt);
    }
  }

  private move(e: PointerEvent): void {
    if (!this.work) return;
    const pt = this.at(e);
    if (this.drag && 'corner' in this.drag) {
      this.corners[this.drag.corner] = pt;
      const next = makePlane(this.corners as Quad);
      if (next) {
        this.plane = next;
        this.rebuildChildren();
        if (this.focalPx === null) this.syncPlanes();
        if (this.paste) this.resizePaste();
      }
      this.render();
    } else if (this.drag && 'grab' in this.drag && this.paste && this.plane) {
      const [u, v] = toPlane(this.plane, pt[0], pt[1]);
      this.paste.rect = { ...this.paste.rect, u: this.drag.at[0] + u - this.drag.grab[0], v: this.drag.at[1] + v - this.drag.grab[1] };
      this.render();
    } else if (this.stroke) {
      const [lx, ly] = this.stroke.last, d = Math.hypot(pt[0] - lx, pt[1] - ly), step = Math.max(1, this.brush / 4);
      for (let t = step; t <= d; t += step) this.dab([lx + ((pt[0] - lx) * t) / d, ly + ((pt[1] - ly) * t) / d]);
      if (d >= step) this.stroke.last = pt;
    }
  }

  private dab(pt: P2): void {
    if (!this.work || !this.plane || !this.stroke) return;
    stampInPerspective(this.work, this.stroke.from, this.plane, pt[0], pt[1], this.brush / 2, this.hardness, this.stroke.offset, this.stampOpacity);
    (this.workCanvas.getContext('2d') as CanvasRenderingContext2D).putImageData(this.work, 0, 0, Math.floor(pt[0] - this.brush), Math.floor(pt[1] - this.brush), this.brush * 2 + 2, this.brush * 2 + 2);
    this.render();
  }

  private startPaste(): void {
    const l = this.engine.current?.doc.layers.find((x) => x.id === this.pasteFrom);
    if (!l?.raster || !this.plane) return;
    const img = l.raster.read();
    this.paste = { img, rect: rectFor(this.plane, img.width, img.height, this.pasteSize, 0.5, 0.5) };
  }

  private resizePaste(): void {
    if (!this.paste || !this.plane) { this.render(); return; }
    const r = this.paste.rect, cu = r.u + r.du / 2, cv = r.v + r.dv / 2;
    this.paste.rect = rectFor(this.plane, this.paste.img.width, this.paste.img.height, this.pasteSize, cu, cv);
    this.render();
  }

  private commitPaste(): void {
    if (!this.paste || !this.plane || !this.work) { this.paste = null; return; }
    pasteInPerspective(this.work, this.paste.img, this.plane, this.paste.rect);
    (this.workCanvas.getContext('2d') as CanvasRenderingContext2D).putImageData(this.work, 0, 0);
    this.paste = null;
  }

  private render(): void {
    const g = this.view.getContext('2d') as CanvasRenderingContext2D, { k, ox, oy } = this.fit;
    g.clearRect(0, 0, PW, PH);
    if (!this.work) return;
    g.save(); g.translate(ox, oy); g.scale(k, k);
    g.imageSmoothingQuality = 'high';
    if (this.paste && this.plane) {
      const tmp = new ImageData(new Uint8ClampedArray(this.work.data), this.work.width, this.work.height);
      pasteInPerspective(tmp, this.paste.img, this.plane, this.paste.rect);
      const c = document.createElement('canvas'); c.width = tmp.width; c.height = tmp.height; (c.getContext('2d') as CanvasRenderingContext2D).putImageData(tmp, 0, 0);
      g.drawImage(c, 0, 0);
    } else g.drawImage(this.workCanvas, 0, 0);
    g.lineWidth = 1.5 / k;
    this.planes.forEach((q, n) => {
      if (!q.plane || n === this.cur) return;
      g.strokeStyle = 'rgba(80, 160, 255, 0.4)';
      for (let i = 0; i <= 4; i++) {
        const t = i / 4, a = toImage(q.plane, t, 0), b = toImage(q.plane, t, 1), c = toImage(q.plane, 0, t), d = toImage(q.plane, 1, t);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.stroke();
      }
    });
    if (this.plane) {
      g.strokeStyle = 'rgba(80, 160, 255, 0.85)';
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, a = toImage(this.plane, t, 0), b = toImage(this.plane, t, 1), c = toImage(this.plane, 0, t), d = toImage(this.plane, 1, t);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.stroke();
      }
      if (this.paste) { const r = this.paste.rect, q = [toImage(this.plane, r.u, r.v), toImage(this.plane, r.u + r.du, r.v), toImage(this.plane, r.u + r.du, r.v + r.dv), toImage(this.plane, r.u, r.v + r.dv)]; g.strokeStyle = 'rgba(255, 200, 60, 0.95)'; g.beginPath(); q.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke(); }
      if (this.stampSource) { const s = toImage(this.plane, this.stampSource[0], this.stampSource[1]); g.strokeStyle = 'rgba(255, 255, 255, 0.95)'; g.beginPath(); g.arc(s[0], s[1], 6 / k, 0, Math.PI * 2); g.stroke(); }
    }
    g.fillStyle = 'rgba(80, 160, 255, 1)';
    for (const q of this.planes) for (const c of q.corners) { g.fillRect(c[0] - 4 / k, c[1] - 4 / k, 8 / k, 8 / k); }
    g.restore();
  }

  private apply(): void {
    this.commitPaste();
    const work = this.work, id = this.layerId;
    this.close();
    if (work && id) { this.engine.selectLayer(id); this.engine.applyImageEdit('Vanishing Point', () => work); }
    this.release();
  }

  private release(): void { this.work = null; this.paste = null; this.stroke = null; this.drag = null; }
}
