import type { Engine, ID, ToolId } from '../engine';
import {
  MAX_RELIGHT_LIGHTS, RELIGHT_LOOKS, RELIGHT_PATTERNS, RELIGHT_TYPES, defaultRelight, depthFromGrey, estimateDepth, kelvinToRgb, newLight, relightFrom, relightGeometry, shadeRelight, shadingField,
  type RelightContent, type RelightGeometry, type RelightLight, type RelightPatternKind, type RelightType,
} from '../engine/relight';
import { renderRelight } from '../gpu/relight-gl';
import { depthReady, localDepth } from '../io/local-gen';
import { setRelightHost } from '../extensions/tools/relight';
import { el, q, setClass, setHidden, setText } from './dom';
import { icon } from './icons';
import { t } from './i18n';
import { checkRow, colorRow, selectRow, sliderRow, type Row } from './panels/controls';

const PREVIEW_SIDE = 1280;
const USER_LOOKS = 'formvis.relight.looks';
const TYPE_ICON: Record<RelightType, string> = { point: 'lightPoint', spot: 'lightSpot', sun: 'sun', area: 'lightArea', strip: 'lightStrip', ring: 'lightRing' };
const hex = (c: { r: number; g: number; b: number }): string => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const fromHex = (h: string): { r: number; g: number; b: number } => ({ r: parseInt(h.slice(1, 3), 16) || 0, g: parseInt(h.slice(3, 5), 16) || 0, b: parseInt(h.slice(5, 7), 16) || 0 });

interface Sized { data: Uint8ClampedArray; w: number; h: number }

function scaled(src: ImageData | ImageBitmap, w: number, h: number): Uint8ClampedArray {
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  g.imageSmoothingQuality = 'high';
  if (src instanceof ImageData) {
    const s = new OffscreenCanvas(src.width, src.height);
    (s.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(src, 0, 0);
    g.drawImage(s, 0, 0, w, h);
  } else g.drawImage(src, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

function sphereGeometry(n: number): { base: Uint8ClampedArray; geo: RelightGeometry } {
  const depth = new Float32Array(n * n), base = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5) / n * 2 - 1, v = (y + 0.5) / n * 2 - 1, r2 = u * u + v * v, i = y * n + x;
    depth[i] = r2 < 0.8 ? Math.sqrt(0.8 - r2) / Math.sqrt(0.8) : 0;
    base.set(r2 < 0.8 ? [196, 192, 186, 255] : [60, 60, 64, 255], i * 4);
  }
  return { base, geo: relightGeometry(depth, n, n) };
}

export class RelightSession {
  readonly panel: HTMLElement;
  readonly bar: HTMLElement;
  readonly pill: HTMLElement;
  private layerId: ID | null = null;
  private isNew = false;
  private prevTool: ToolId = 'move';
  private content: RelightContent = defaultRelight();
  private selectedId: string | null = null;
  private full: Sized | null = null;
  private proxy: { base: Uint8ClampedArray; geo: RelightGeometry; shade: Float32Array } | null = null;
  private depthBitmap: ImageBitmap | null = null;
  private frame = 0;
  private busy = false;
  private readonly rows: { [k: string]: Row<number> | Row<string> | Row<boolean> } = {};
  private readonly lightRows = new Map<string, HTMLElement>();
  private readonly typeButtons = new Map<RelightType, HTMLButtonElement>();
  private readonly sphere = sphereGeometry(40);

  constructor(private readonly engine: Engine, propsRoot: HTMLElement, stage: HTMLElement) {
    this.panel = this.buildPanel();
    this.bar = this.buildBar();
    this.pill = el(`<div class="cv-relight-pill" hidden><button class="cv-relight-btn" type="button">${icon('relight', 14)}<span></span></button></div>`);
    setText(q(this.pill, 'button > span:last-child'), t('Edit Lighting'));
    q(this.pill, 'button').addEventListener('click', () => { const l = engine.activeLayer; if (l?.relight) void this.begin(l.id); });
    const head = propsRoot.querySelector('.cv-props-head');
    if (head) head.after(this.panel); else propsRoot.prepend(this.panel);
    stage.append(this.bar, this.pill);
    setRelightHost({
      active: () => this.layerId !== null && !this.busy,
      size: () => ({ w: this.full?.w ?? 1, h: this.full?.h ?? 1 }),
      lights: () => this.content.lights,
      selected: () => this.selectedId,
      select: (id) => { this.selectedId = id; this.sync(); },
      move: (id, part, at, done) => this.moveLight(id, part, at, done),
      nudge: (dx, dy, aim) => { const l = this.light(); if (l) { const p = aim ? l.aim : l.pos; this.moveLight(l.id, aim ? 'aim' : 'pos', { x: p.x + dx, y: p.y + dy }, true); this.engine.emit('overlay', null); } },
      cycle: (back) => {
        const ls = this.content.lights, i = ls.findIndex((l) => l.id === this.selectedId);
        if (!ls.length) return;
        this.selectedId = ls[(i + (back ? -1 : 1) + ls.length) % ls.length].id;
        this.sync(); this.engine.emit('overlay', null);
      },
      commit: () => { void this.commit(); },
      cancel: () => this.cancel(),
    });
    for (const ev of ['active', 'history', 'doc'] as const) engine.on(ev, () => this.syncPill());
    this.syncPill();
  }

  get editing(): boolean { return this.layerId !== null; }

  async begin(editId?: ID): Promise<void> {
    const e = this.engine, p = e.current;
    if (this.layerId || !p) return;
    if ((p.doc.mode ?? 'rgb') !== 'rgb' || (p.doc.depth ?? 8) > 8) { e.notice(t('Relight works on 8-bit RGB documents.')); return; }
    const existing = editId ? p.layer(editId) : null;
    if (editId && !existing?.relight) return;
    const W = p.doc.width, H = p.doc.height;
    this.content = existing?.relight ? structuredClone(existing.relight) : defaultRelight();
    let id: ID | null = editId ?? null;
    if (!id) { id = e.newRelightLayer(structuredClone(this.content), new ImageData(W, H)); this.isNew = true; }
    if (!id) { this.isNew = false; return; }
    const below = e.compositeUnder(id);
    if (!below) { if (this.isNew) e.dropNewRelight(id); this.isNew = false; return; }
    this.layerId = id;
    this.full = { data: below.data, w: W, h: H };
    const k = Math.min(1, PREVIEW_SIDE / Math.max(W, H)), pw = Math.max(1, Math.round(W * k)), ph = Math.max(1, Math.round(H * k));
    const pbase = k < 1 ? scaled(below, pw, ph) : below.data;
    this.proxy = { base: pbase, geo: relightGeometry(estimateDepth(pbase, pw, ph), pw, ph), shade: shadingField(pbase, pw, ph) };
    this.content.depth = 'estimate';
    this.depthBitmap = null;
    this.selectedId = this.content.lights[0]?.id ?? null;
    this.prevTool = e.tool === 'relight' ? 'move' : e.tool;
    e.setTool('relight');
    setHidden(this.panel, false);
    setHidden(this.bar, false);
    this.syncPill();
    this.sync();
    this.schedule();
    void this.loadDepth(below, pw, ph);
  }

  async apply(content: RelightContent): Promise<{ id: ID; depth: 'model' | 'estimate' } | null> {
    const e = this.engine, p = e.current;
    if (this.layerId || !p || (p.doc.mode ?? 'rgb') !== 'rgb' || (p.doc.depth ?? 8) > 8) return null;
    const W = p.doc.width, H = p.doc.height, id = e.newRelightLayer(structuredClone(content), new ImageData(W, H));
    if (!id) return null;
    const below = e.compositeUnder(id);
    if (!below) { e.dropNewRelight(id); return null; }
    let depth: Float32Array | null = null, kind: 'model' | 'estimate' = 'estimate';
    try {
      if (await depthReady()) {
        const c = new OffscreenCanvas(W, H);
        (c.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(below, 0, 0);
        const bmp = await createImageBitmap(await localDepth(await c.convertToBlob({ type: 'image/png' })));
        depth = depthFromGrey(scaled(bmp, W, H), W, H);
        bmp.close();
        kind = 'model';
      }
    } catch { depth = null; }
    const made = { ...structuredClone(content), depth: kind };
    const px = renderRelight(below.data, relightGeometry(depth ?? estimateDepth(below.data, W, H), W, H), made, kind === 'model' ? 24 : 0, shadingField(below.data, W, H));
    return e.setRelight(id, made, new ImageData(new Uint8ClampedArray(px), W, H)) ? { id, depth: kind } : null;
  }

  private async loadDepth(below: ImageData, pw: number, ph: number): Promise<void> {
    const id = this.layerId;
    try {
      if (!(await depthReady())) { this.status(t('Shape estimated from the picture. Download Depth Anything in Preferences > Plugins > Local models for light that follows the forms.')); return; }
      this.status(t('Reading the shape of the picture...'));
      const c = new OffscreenCanvas(below.width, below.height);
      (c.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(below, 0, 0);
      const bmp = await createImageBitmap(await localDepth(await c.convertToBlob({ type: 'image/png' })));
      if (this.layerId !== id || !this.proxy) { bmp.close(); return; }
      this.depthBitmap = bmp;
      this.proxy = { ...this.proxy, geo: relightGeometry(depthFromGrey(scaled(bmp, pw, ph), pw, ph), pw, ph) };
      this.content.depth = 'model';
      this.status(t('Shape from Depth Anything, on this computer.'));
      this.schedule();
    } catch { this.status(t('Shape estimated from the picture; the depth model did not answer.')); }
  }

  private status(text: string): void { setText(q(this.panel, '.cv-relight-status'), text); }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.layerId || !this.proxy) return;
      const g = this.proxy.geo, px = renderRelight(this.proxy.base, g, this.content, this.content.depth === 'model' ? 20 : 0, this.proxy.shade);
      this.engine.previewRelight(this.layerId, new ImageData(new Uint8ClampedArray(px), g.width, g.height));
      this.engine.emit('overlay', null);
    });
  }

  private async commit(): Promise<void> {
    const id = this.layerId, f = this.full;
    if (!id || !f || this.busy) return;
    this.busy = true;
    setClass(this.bar, 'is-busy', true);
    await new Promise((r) => setTimeout(r, 0));
    try {
      const depth = this.depthBitmap ? depthFromGrey(scaled(this.depthBitmap, f.w, f.h), f.w, f.h) : estimateDepth(f.data, f.w, f.h);
      const px = renderRelight(f.data, relightGeometry(depth, f.w, f.h), this.content, this.depthBitmap ? 24 : 0, shadingField(f.data, f.w, f.h));
      this.engine.setRelight(id, structuredClone(this.content), new ImageData(new Uint8ClampedArray(px), f.w, f.h), this.isNew);
    } finally {
      this.busy = false;
      setClass(this.bar, 'is-busy', false);
      this.end();
    }
  }

  cancel(): void {
    const id = this.layerId;
    if (!id || this.busy) return;
    if (this.isNew) this.engine.dropNewRelight(id); else this.engine.previewRelight(null);
    this.end();
  }

  private end(): void {
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    this.layerId = null; this.isNew = false; this.full = null; this.proxy = null;
    this.depthBitmap?.close(); this.depthBitmap = null;
    if (this.engine.tool === 'relight') this.engine.setTool(this.prevTool);
    setHidden(this.panel, true);
    setHidden(this.bar, true);
    this.syncPill();
    this.engine.emit('overlay', null);
  }

  private syncPill(): void {
    const l = this.engine.activeLayer;
    setHidden(this.pill, this.editing || !l?.relight || !l.visible);
  }

  private light(): RelightLight | null { return this.content.lights.find((l) => l.id === this.selectedId) ?? this.content.lights[0] ?? null; }

  private change(fn: (l: RelightLight) => void): void {
    const l = this.light();
    if (!l) return;
    fn(l);
    this.content.look = undefined;
    this.sync();
    this.schedule();
  }

  private moveLight(id: string, part: 'pos' | 'aim', at: { x: number; y: number }, done: boolean): void {
    const l = this.content.lights.find((x) => x.id === id);
    if (!l) return;
    l[part] = { x: Math.max(-1, Math.min(2, at.x)), y: Math.max(-1, Math.min(2, at.y)) };
    if (done) this.sync();
    this.schedule();
  }

  private addLight(type: RelightType): void {
    if (this.content.lights.length >= MAX_RELIGHT_LIGHTS) { this.engine.notice(t('A relight layer holds up to eight lights.')); return; }
    const n = this.content.lights.length, l = newLight({ type, name: `Light ${n + 1}`, pos: { x: n % 2 ? 0.85 : 0.15, y: 0.2 + 0.1 * (n % 3) } });
    this.content.lights.push(l);
    this.selectedId = l.id;
    this.sync();
    this.schedule();
  }

  private lookButton(id: string, label: string, content: RelightContent, user = false): HTMLButtonElement {
    const b = el<HTMLButtonElement>(`<button class="cv-relight-look" type="button"><canvas width="40" height="40"></canvas></button>`);
    b.dataset.look = id;
    b.title = user ? `${label} · ${t('Alt-click to delete')}` : label;
    b.setAttribute('aria-label', label);
    const px = shadeRelight(this.sphere.base, this.sphere.geo, content, { shadowSteps: 0 });
    (q<HTMLCanvasElement>(b, 'canvas').getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(new Uint8ClampedArray(px), 40, 40), 0, 0);
    b.addEventListener('click', (ev) => {
      if (user && ev.altKey) { this.storeLooks(this.userLooks().filter((x) => x.id !== id)); b.remove(); return; }
      this.applyLook(id);
    });
    return b;
  }

  private userLooks(): Array<{ id: string; label: string; content: RelightContent }> {
    try {
      const raw = JSON.parse(localStorage.getItem(USER_LOOKS) ?? '[]') as unknown;
      if (!Array.isArray(raw)) return [];
      return raw.flatMap((x) => {
        const o = (x ?? {}) as Record<string, unknown>, c = relightFrom(o.content);
        return c && typeof o.id === 'string' ? [{ id: o.id, label: typeof o.label === 'string' ? o.label.slice(0, 60) : 'My Look', content: c }] : [];
      });
    } catch { return []; }
  }

  private storeLooks(list: Array<{ id: string; label: string; content: RelightContent }>): void {
    try { localStorage.setItem(USER_LOOKS, JSON.stringify(list.slice(0, 28))); } catch { this.engine.notice(t('This browser would not keep the Look.')); }
  }

  private saveLook(): void {
    const list = this.userLooks();
    if (list.length >= 28) { this.engine.notice(t('Up to 28 saved Looks; Alt-click one to delete it.')); return; }
    let n = list.length + 1;
    while (list.some((x) => x.label === `My Look ${n}`)) n += 1;
    const { depth: _depth, look: _look, ...rest } = structuredClone(this.content);
    const item = { id: `user-${Date.now().toString(36)}`, label: `My Look ${n}`, content: rest };
    this.storeLooks([...list, item]);
    const save = q(this.panel, '.cv-relight-look.is-save');
    save.before(this.lookButton(item.id, item.label, item.content, true));
    this.content.look = item.id;
    this.sync();
  }

  private applyLook(id: string): void {
    const look = RELIGHT_LOOKS.find((x) => x.id === id), user = look ? null : this.userLooks().find((x) => x.id === id);
    if (!look && !user) return;
    const made = look ? look.make() : relightFrom(structuredClone(user!.content)) ?? defaultRelight();
    this.content = { ...made, look: id, ...(this.content.depth ? { depth: this.content.depth } : {}) };
    this.selectedId = made.lights[0]?.id ?? null;
    this.sync();
    this.schedule();
  }

  private resetAll(): void {
    const d = defaultRelight();
    this.content = { ...d, ...(this.content.depth ? { depth: this.content.depth } : {}) };
    this.selectedId = d.lights[0].id;
    this.sync();
    this.schedule();
  }

  private buildPanel(): HTMLElement {
    const root = el(`<section class="cv-relight" hidden>
      <div class="cv-relight-title">${icon('relight', 16)}<span></span></div>
      <button class="cv-props-section" type="button" aria-expanded="true" data-fold="looks">${icon('chevronDown', 12)}<span></span></button>
      <div class="cv-relight-looks" data-part="looks"></div>
      <div class="cv-relight-lights-head"><button class="cv-props-section" type="button" aria-expanded="true" data-fold="lights">${icon('chevronDown', 12)}<span></span></button><select class="cv-input cv-relight-add" aria-label="Add Light"></select></div>
      <div class="cv-relight-list" data-part="lights"></div>
      <button class="cv-props-section" type="button" aria-expanded="true" data-fold="light">${icon('chevronDown', 12)}<span class="cv-relight-light-name"></span></button>
      <div class="cv-relight-light" data-part="light">
        <div class="cv-field"><span></span><div class="cv-relight-types" role="radiogroup"></div></div>
      </div>
      <div class="cv-relight-pattern" data-part="light"></div>
      <button class="cv-props-section" type="button" aria-expanded="true" data-fold="scene">${icon('chevronDown', 12)}<span></span></button>
      <div class="cv-relight-scene" data-part="scene"></div>
      <p class="cv-relight-status cv-note"></p>
    </section>`);
    setText(q(root, '.cv-relight-title > span:last-child'), t('Relight Properties'));
    const folds = root.querySelectorAll<HTMLButtonElement>('[data-fold]');
    const labels: Record<string, string> = { looks: 'Looks', lights: 'Lights', scene: 'Scene' };
    folds.forEach((b) => {
      const k = b.dataset.fold ?? '';
      if (labels[k]) setText(q(b, ':scope > span:last-child'), t(labels[k]));
      b.addEventListener('click', () => {
        const open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', String(open));
        root.querySelectorAll<HTMLElement>(`[data-part="${k}"]`).forEach((p) => setHidden(p, !open));
      });
    });
    const looks = q(root, '.cv-relight-looks');
    for (const look of RELIGHT_LOOKS) looks.append(this.lookButton(look.id, t(look.label), look.make()));
    const save = el<HTMLButtonElement>(`<button class="cv-relight-look is-save" type="button">${icon('plus', 16)}</button>`);
    save.title = t('Save these lights as a Look');
    save.setAttribute('aria-label', t('Save these lights as a Look'));
    save.addEventListener('click', () => this.saveLook());
    for (const u of this.userLooks()) looks.append(this.lookButton(u.id, u.label, u.content, true));
    looks.append(save);
    const add = q<HTMLSelectElement>(root, '.cv-relight-add');
    add.append(el(`<option value="">${t('Add Light')}</option>`), ...RELIGHT_TYPES.map(([k, label]) => el(`<option value="${k}">${t(label)}</option>`)));
    add.addEventListener('change', () => { const v = add.value as RelightType; add.value = ''; if (v) this.addLight(v); });
    const light = q(root, '.cv-relight-light'), typeRow = q(light, '.cv-field');
    setText(q(typeRow, 'span'), t('Type'));
    const types = q(typeRow, '.cv-relight-types');
    for (const [k, label] of RELIGHT_TYPES) {
      const b = el<HTMLButtonElement>(`<button class="cv-relight-type" type="button" role="radio" aria-checked="false">${icon(TYPE_ICON[k], 16)}</button>`);
      b.title = t(label);
      b.setAttribute('aria-label', t(label));
      b.addEventListener('click', () => this.change((l) => { l.type = k; }));
      this.typeButtons.set(k, b);
      types.append(b);
    }
    const slider = (key: string, label: string, min: number, max: number, set: (l: RelightLight, v: number) => void, host: HTMLElement = light): void => {
      const r = sliderRow(t(label), min, max, 1, (v) => this.change((l) => set(l, v)));
      this.rows[key] = r; host.append(r.el);
    };
    slider('kelvin', 'Temperature', 1000, 12000, (l, v) => { l.kelvin = v; l.color = kelvinToRgb(v); });
    const color = colorRow(t('Color'), (h) => this.change((l) => { l.kelvin = null; l.color = fromHex(h); }));
    this.rows.color = color; light.append(color.el);
    slider('intensity', 'Intensity', 0, 100, (l, v) => { l.intensity = v; });
    slider('softness', 'Softness', 0, 100, (l, v) => { l.softness = v; });
    slider('diffusion', 'Diffusion', 0, 100, (l, v) => { l.diffusion = v; });
    slider('distance', 'Close to Far', 0, 100, (l, v) => { l.distance = v; });
    slider('near', 'Lights from depth', 0, 100, (l, v) => { l.near = v; });
    slider('far', 'Lights to depth', 0, 100, (l, v) => { l.far = v; });
    light.append(el(`<p class="cv-note">${t('Drag the light or its aim point on the photo. Alt-drag moves the aim.')}</p>`));
    const pat = q(root, '.cv-relight-pattern');
    const kind = selectRow(t('Pattern'), RELIGHT_PATTERNS.map(([k, label]) => [k, t(label)] as const), (v) => this.change((l) => { l.pattern.kind = v as RelightPatternKind; }));
    this.rows.pattern = kind; pat.append(kind.el);
    const sub = el('<div class="cv-relight-sub"></div>');
    pat.append(sub);
    slider('p.scale', 'Scale', 10, 400, (l, v) => { l.pattern.scale = v; }, sub);
    slider('p.width', 'Width', 1, 200, (l, v) => { l.pattern.width = v; }, sub);
    slider('p.length', 'Length', 1, 200, (l, v) => { l.pattern.length = v; }, sub);
    slider('p.slats', 'Slats', 2, 60, (l, v) => { l.pattern.slats = v; }, sub);
    slider('p.opening', 'Opening', 1, 99, (l, v) => { l.pattern.opening = v; }, sub);
    slider('p.feather', 'Feather', 0, 100, (l, v) => { l.pattern.feather = v; }, sub);
    slider('p.rotation', 'Rotation', -180, 180, (l, v) => { l.pattern.rotation = v; }, sub);
    const inv = checkRow(t('Invert'), (v) => this.change((l) => { l.pattern.invert = v; }));
    this.rows['p.invert'] = inv; sub.append(inv.el);
    const scene = q(root, '.cv-relight-scene');
    const orig = sliderRow(t('Original lighting'), 0, 100, 1, (v) => { this.content.original = v; this.schedule(); });
    const shine = sliderRow(t('Shine'), 0, 100, 1, (v) => { this.content.shine = v; this.schedule(); });
    const delight = sliderRow(t('Flatten original light'), 0, 100, 1, (v) => { this.content.delight = v; this.schedule(); });
    const shadows = sliderRow(t('Shadows'), 0, 100, 1, (v) => { this.content.shadows = v; this.schedule(); });
    const ambient = colorRow(t('Ambient'), (h) => { this.content.ambient = fromHex(h); this.schedule(); });
    this.rows.original = orig; this.rows.shine = shine; this.rows.delight = delight; this.rows.shadows = shadows; this.rows.ambient = ambient;
    scene.append(orig.el, delight.el, ambient.el, shine.el, shadows.el);
    return root;
  }

  private buildBar(): HTMLElement {
    const bar = el(`<div class="cv-relight-bar" hidden role="toolbar">
      <select class="cv-input cv-relight-bar-add"></select>
      <span class="cv-relight-swatch" aria-hidden="true"></span>
      <button class="cv-relight-btn is-icon" type="button" data-act="reset">${icon('undo', 14)}</button>
      <button class="cv-relight-btn" type="button" data-act="cancel"></button>
      <button class="cv-relight-btn is-primary" type="button" data-act="done"></button>
    </div>`);
    const add = q<HTMLSelectElement>(bar, 'select');
    add.setAttribute('aria-label', t('Add Light'));
    add.append(el(`<option value="">${t('Add Light')}</option>`), ...RELIGHT_TYPES.map(([k, label]) => el(`<option value="${k}">${t(label)}</option>`)));
    add.addEventListener('change', () => { const v = add.value as RelightType; add.value = ''; if (v) this.addLight(v); });
    const reset = q<HTMLButtonElement>(bar, '[data-act="reset"]');
    reset.title = t('Reset the lights');
    reset.setAttribute('aria-label', t('Reset the lights'));
    reset.addEventListener('click', () => this.resetAll());
    setText(q(bar, '[data-act="cancel"]'), t('Cancel'));
    setText(q(bar, '[data-act="done"]'), t('Done'));
    q(bar, '[data-act="cancel"]').addEventListener('click', () => this.cancel());
    q(bar, '[data-act="done"]').addEventListener('click', () => { void this.commit(); });
    return bar;
  }

  private lightRow(l: RelightLight): HTMLElement {
    const row = el(`<div class="cv-relight-row" role="button" tabindex="0"><span class="cv-relight-dot"></span><span class="cv-relight-name"></span><span class="cv-relight-kind"></span><button class="cv-relight-btn is-icon" type="button" data-act="eye"></button><button class="cv-relight-btn is-icon" type="button" data-act="delete">${icon('delete', 14)}</button></div>`);
    row.dataset.id = l.id;
    const pick = (): void => { this.selectedId = l.id; this.sync(); this.engine.emit('overlay', null); };
    row.addEventListener('click', (ev) => { if (!(ev.target as HTMLElement).closest('[data-act]')) pick(); });
    row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
    const eye = q<HTMLButtonElement>(row, '[data-act="eye"]');
    eye.addEventListener('click', () => { const x = this.content.lights.find((y) => y.id === l.id); if (x) { x.visible = !x.visible; this.sync(); this.schedule(); } });
    const del = q<HTMLButtonElement>(row, '[data-act="delete"]');
    del.title = t('Delete the light');
    del.setAttribute('aria-label', t('Delete the light'));
    del.addEventListener('click', () => {
      if (this.content.lights.length <= 1) { this.engine.notice(t('A relight layer keeps at least one light.')); return; }
      this.content.lights = this.content.lights.filter((y) => y.id !== l.id);
      if (this.selectedId === l.id) this.selectedId = this.content.lights[0]?.id ?? null;
      this.sync(); this.schedule();
    });
    return row;
  }

  private sync(): void {
    const list = q(this.panel, '.cv-relight-list'), ids = new Set(this.content.lights.map((l) => l.id));
    for (const [id, row] of this.lightRows) if (!ids.has(id)) { row.remove(); this.lightRows.delete(id); }
    let prev: HTMLElement | null = null;
    for (const l of this.content.lights) {
      let row = this.lightRows.get(l.id);
      if (!row) { row = this.lightRow(l); this.lightRows.set(l.id, row); }
      const want: ChildNode | null = prev ? prev.nextSibling : list.firstChild;
      if (want !== row) list.insertBefore(row, want);
      setText(q(row, '.cv-relight-name'), l.name);
      setText(q(row, '.cv-relight-kind'), t(RELIGHT_TYPES.find(([k]) => k === l.type)?.[1] ?? ''));
      const dot = q(row, '.cv-relight-dot'), c = hex(l.color);
      if (dot.style.backgroundColor !== c) dot.style.backgroundColor = c;
      setClass(row, 'is-on', l.id === this.selectedId);
      setClass(row, 'is-off', !l.visible);
      const eye = q<HTMLButtonElement>(row, '[data-act="eye"]'), want2 = l.visible ? 'eye' : 'eyeOff';
      if (eye.dataset.icon !== want2) { eye.dataset.icon = want2; eye.innerHTML = icon(want2, 14); eye.title = t(l.visible ? 'Hide the light' : 'Show the light'); }
      prev = row;
    }
    const l = this.light();
    if (l) {
      setText(q(this.panel, '.cv-relight-light-name'), l.name);
      for (const [k, b] of this.typeButtons) { setClass(b, 'is-on', k === l.type); b.setAttribute('aria-checked', String(k === l.type)); }
      (this.rows.kelvin as Row<number>).set(l.kelvin ?? 6500);
      (this.rows.color as Row<string>).set(hex(l.color));
      for (const k of ['intensity', 'softness', 'diffusion', 'distance'] as const) (this.rows[k] as Row<number>).set(l[k]);
      (this.rows.near as Row<number>).set(l.near ?? 0);
      (this.rows.far as Row<number>).set(l.far ?? 100);
      (this.rows.pattern as Row<string>).set(l.pattern.kind);
      const pk = l.pattern.kind;
      setHidden(q(this.panel, '.cv-relight-sub'), pk === 'none');
      const shown: Record<string, boolean> = { scale: true, width: pk === 'blinds' || pk === 'strip', length: pk === 'strip', slats: pk === 'blinds', opening: pk === 'blinds' || pk === 'leaves', feather: true, rotation: true };
      for (const k of ['scale', 'width', 'length', 'slats', 'opening', 'feather', 'rotation'] as const) {
        const r = this.rows[`p.${k}`] as Row<number>;
        r.set(l.pattern[k]);
        setHidden(r.el, !shown[k]);
      }
      (this.rows['p.invert'] as Row<boolean>).set(l.pattern.invert);
      const sw = q(this.bar, '.cv-relight-swatch'), c = hex(l.color);
      if (sw.style.backgroundColor !== c) sw.style.backgroundColor = c;
    }
    (this.rows.original as Row<number>).set(this.content.original);
    (this.rows.shine as Row<number>).set(this.content.shine);
    (this.rows.delight as Row<number>).set(this.content.delight ?? 0);
    (this.rows.shadows as Row<number>).set(this.content.shadows ?? 70);
    (this.rows.ambient as Row<string>).set(hex(this.content.ambient ?? { r: 255, g: 255, b: 255 }));
    this.panel.querySelectorAll<HTMLButtonElement>('.cv-relight-look').forEach((b) => setClass(b, 'is-on', b.dataset.look === this.content.look));
  }
}
