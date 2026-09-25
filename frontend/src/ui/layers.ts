import { BLEND_MODES, hierarchy, type Engine, type HierarchyEntry, type ID, type Layer, type Raster, effectsActive } from '../engine';
import { el, isMac, patchList, q, setClass, setDisabled, setHidden, setHtml, setStyleVar, setText, setTitle, setValue } from './dom';
import { icon } from './icons';
import { paint } from './palette';
import type { PopupMenu } from './menu';

const THUMB = 60;
type Where = 'above' | 'below' | 'inside';

export class LayersPanel {
  private readonly rows: HTMLElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly dropLine: HTMLElement;
  private readonly blend: HTMLSelectElement;
  private readonly opacity: HTMLInputElement;
  private readonly opacityOut: HTMLElement;
  private readonly painted = new WeakMap<HTMLElement, { pixels: string; mask: string }>();
  private frame = 0;
  private opacityDrag = false;
  private renaming: ID | null = null;
  private drag: { id: ID; ids: ID[]; startY: number; pointerId: number; started: boolean; wasSelected: boolean; target: { id: ID; where: Where } | null; maskFrom: ID | null; tabTarget: string | null } | null = null;
  private swipe: { visible: boolean; pointerId: number } | null = null;

  constructor(root: HTMLElement, private readonly engine: Engine, private readonly menu: PopupMenu) {
    root.insertAdjacentHTML('beforeend',
      `<section class="cv-layers-panel" aria-label="Layers"><div class="cv-panel-head"><span class="cv-panel-title">${icon('layers', 14)}Layers</span><span></span><button class="cv-icon-btn" type="button" data-cmd="new-folder">${icon('folder', 16)}</button></div>` +
      `<div class="cv-layer-props"><select class="cv-select cv-blend" title="Blend mode" aria-label="Blend mode">${BLEND_MODES.map((b) => `<option value="${b.id}">${b.label}</option>`).join('')}</select>` +
      `<label class="cv-opacity" title="Opacity"><input class="cv-opacity-range" type="range" min="0" max="100" step="1" value="100" aria-label="Opacity"><span class="cv-readout cv-opacity-out">100%</span></label></div>` +
      `<div class="cv-layer-list"><div class="cv-layer-rows" role="listbox" aria-label="Layers"></div><div class="cv-drop-line"></div><div class="cv-layers-empty">No canvas open. Create one or drop images on the stage.</div></div>` +
      `<div class="cv-panel-foot"><button class="cv-icon-btn" type="button" data-cmd="add-mask">${icon('mask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="clip">${icon('clipMask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="duplicate">${icon('duplicate', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-layer">${icon('add', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="delete-layer">${icon('delete', 16)}</button></div></section>`);
    this.rows = q(root, '.cv-layer-rows');
    this.list = q(root, '.cv-layer-list');
    this.empty = q(root, '.cv-layers-empty');
    this.dropLine = q(root, '.cv-drop-line');
    this.blend = q<HTMLSelectElement>(root, '.cv-blend');
    this.opacity = q<HTMLInputElement>(root, '.cv-opacity-range');
    this.opacityOut = q(root, '.cv-opacity-out');
    this.blend.addEventListener('change', () => engine.setBlend(this.blend.value as Layer['blend']));
    this.opacity.addEventListener('pointerdown', () => { this.opacityDrag = true; engine.beginOpacityEdit(); });
    this.opacity.addEventListener('input', () => {
      const v = Number(this.opacity.value) / 100;
      setText(this.opacityOut, `${this.opacity.value}%`);
      if (this.opacityDrag) engine.setOpacityLive(v);
      else engine.setOpacity(v);
    });
    const endOpacity = (): void => { if (!this.opacityDrag) return; this.opacityDrag = false; engine.endOpacityEdit(); };
    this.opacity.addEventListener('change', endOpacity);
    this.opacity.addEventListener('pointerup', endOpacity);
    for (const k of ['doc', 'active', 'projects', 'history'] as const) engine.on(k, () => this.queue());
    this.bindRows();
    this.render();
  }

  private queue(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }

  restyle(): void {
    for (const row of Array.from(this.rows.children)) this.painted.delete(row as HTMLElement);
    this.queue();
  }

  private render(): void {
    const p = this.engine.current;
    const entries = p ? hierarchy(p.doc, true, p.collapsed) : [];
    setHidden(this.empty, entries.length > 0);
    // Rows moved by a layer arriving or leaving are held where they were by a transform and then eased into place (FLIP),
    // so a layer that arrives with no click just before it (an import, Remove Background finishing) does not make the
    // list jump; browsers do not count movement by transform as a layout shift.
    const count = this.rows.children.length, before = new Map<string, number>();
    for (const r of Array.from(this.rows.children) as HTMLElement[]) before.set(r.dataset.id ?? '', r.getBoundingClientRect().top);
    patchList(this.rows, entries, {
      key: (e) => e.layer.id,
      create: (e) => this.createRow(e),
      update: (n, e) => this.updateRow(n, e),
    });
    if (count && this.rows.children.length !== count) {
      const moved: HTMLElement[] = [];
      for (const r of Array.from(this.rows.children) as HTMLElement[]) {
        const was = before.get(r.dataset.id ?? '');
        if (was === undefined) continue;
        const dy = Math.round(was - r.getBoundingClientRect().top);
        if (!dy) continue;
        setClass(r, 'is-settling', false);
        setStyleVar(r, '--flip', `${dy}px`);
        moved.push(r);
      }
      if (moved.length) requestAnimationFrame(() => { for (const r of moved) { setClass(r, 'is-settling', true); setStyleVar(r, '--flip', '0px'); } });
    }
    this.syncProps();
  }

  private createRow(e: HierarchyEntry): HTMLElement {
    const row = el(`<div class="cv-layer" role="option"><button class="cv-layer-eye" type="button" tabindex="-1" aria-label="Show or hide"><span class="cv-eye-on">${icon('eye', 14)}</span><span class="cv-eye-off">${icon('eyeOff', 14)}</span></button><span class="cv-layer-indent"></span><button class="cv-layer-disclose" type="button" tabindex="-1" aria-label="Expand or collapse"><span class="cv-open">${icon('chevronDown', 12)}</span><span class="cv-shut">${icon('chevronRight', 12)}</span></button><canvas class="cv-layer-thumb" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-kind"></span><canvas class="cv-layer-mask" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-name"><span class="cv-layer-clip">${icon('clipMask', 12)}</span><span class="cv-layer-label"></span><span class="cv-layer-fx" hidden title="Layer style">fx</span><span class="cv-layer-smart" hidden title="Smart object: double-click for its filters">${icon('smartObject', 12)}</span><span class="cv-layer-vector" hidden title="Shape layer: double-click for its fill and stroke">${icon('penTool', 12)}</span></span></div>`);
    row.dataset.id = e.layer.id;
    this.updateRow(row, e);
    return row;
  }

  private updateRow(row: HTMLElement, e: HierarchyEntry): void {
    const p = this.engine.current;
    if (!p) return;
    const l = e.layer;
    const active = p.activeId === l.id;
    const collapsed = p.collapsed.has(l.id);
    setClass(row, 'is-selected', p.selectedIds.has(l.id));
    setClass(row, 'is-active', active);
    setClass(row, 'is-hidden', !l.visible);
    setClass(row, 'is-dimmed', l.visible && !e.visible);
    setClass(row, 'is-group', l.isGroup);
    setClass(row, 'is-collapsed', collapsed);
    setClass(row, 'is-adjust', !!l.adjustment);
    setClass(row, 'has-mask', !!l.mask);
    setClass(row, 'mask-off', !!l.mask && !l.mask.enabled);
    setClass(row, 'is-mask-target', active && p.maskTarget && !!l.mask);
    setClass(row, 'is-pixel-target', active && !p.maskTarget && !!l.mask);
    setClass(row, 'is-clipped', !!l.clipId);
    setHidden(q(row, '.cv-layer-fx'), !effectsActive(l.effects));
    setHidden(q(row, '.cv-layer-smart'), !l.smart);
    setHidden(q(row, '.cv-layer-vector'), !l.vector);
    setClass(row, 'is-text', this.engine.liveText(l));
    setStyleVar(row, '--depth', String(e.depth));
    if (this.renaming !== l.id) setText(q(row, '.cv-layer-label'), l.name);
    setTitle(row, l.name);
    const kind = l.isGroup ? (collapsed ? 'folder' : 'folderOpen') : l.adjustment ? 'levels' : '';
    if (kind) setHtml(q(row, '.cv-layer-kind'), icon(kind, 16), kind);
    const state = this.painted.get(row) ?? { pixels: '', mask: '' };
    const pk = l.raster && !l.isGroup ? `${l.raster.id}:${l.raster.version}` : 'none';
    if (state.pixels !== pk) { this.drawThumb(q<HTMLCanvasElement>(row, '.cv-layer-thumb'), l.isGroup ? null : l.raster, false); state.pixels = pk; }
    const mk = l.mask ? `${l.mask.raster?.id ?? 'full'}:${l.mask.raster?.version ?? 0}` : 'none';
    if (state.mask !== mk) { if (l.mask) this.drawThumb(q<HTMLCanvasElement>(row, '.cv-layer-mask'), l.mask.raster, true); state.mask = mk; }
    this.painted.set(row, state);
  }

  private drawThumb(c: HTMLCanvasElement, r: Raster | null, mask: boolean): void {
    const g = c.getContext('2d');
    if (!g) return;
    const pal = paint();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, THUMB, THUMB);
    if (mask) {
      g.fillStyle = pal.antsA;
      g.fillRect(0, 0, THUMB, THUMB);
      if (!r) { g.fillStyle = pal.antsB; g.fillRect(0, 0, THUMB, THUMB); return; }
    } else {
      const cell = 6;
      g.fillStyle = pal.checkerA;
      g.fillRect(0, 0, THUMB, THUMB);
      g.fillStyle = pal.checkerB;
      for (let y = 0; y < THUMB; y += cell) for (let x = (y / cell) % 2 ? 0 : cell; x < THUMB; x += cell * 2) g.fillRect(x, y, cell, cell);
      if (!r) return;
    }
    const src = r as Raster;
    const s = Math.min(THUMB / src.width, THUMB / src.height);
    const w = Math.max(1, src.width * s), h = Math.max(1, src.height * s);
    g.imageSmoothingQuality = 'medium';
    g.drawImage(src.canvas as CanvasImageSource, (THUMB - w) / 2, (THUMB - h) / 2, w, h);
  }

  private syncProps(): void {
    const l = this.engine.activeLayer;
    const pixel = !!l && !l.isGroup;
    setDisabled(this.blend, !pixel);
    setDisabled(this.opacity, !pixel);
    setValue(this.blend, pixel ? (l as Layer).blend : 'normal');
    const pct = String(Math.round((pixel ? (l as Layer).opacity : 1) * 100));
    if (!this.opacityDrag) { setValue(this.opacity, pct); setText(this.opacityOut, `${pct}%`); }
  }

  private rowOf(id: ID): HTMLElement | null {
    for (const child of Array.from(this.rows.children)) if ((child as HTMLElement).dataset.id === id) return child as HTMLElement;
    return null;
  }

  /** Marks the project tab a layer drag would copy into, clearing the rest. */
  private showTabDrop(key: string | null): void {
    for (const t of document.querySelectorAll<HTMLElement>('.cv-tab')) setClass(t, 'is-drop-target', !!key && t.dataset.key === key);
  }

  /** zone: the bottom quarter of a row, the boundary with the layer below. */
  private inClipZone(row: HTMLElement, clientY: number): boolean {
    const r = row.getBoundingClientRect();
    return r.height > 0 && (clientY - r.top) / r.height >= 0.75;
  }

  private rowAt(clientX: number, clientY: number): HTMLElement | null {
    const hit = document.elementFromPoint(clientX, clientY);
    const row = hit instanceof Element ? hit.closest<HTMLElement>('.cv-layer') : null;
    return row && this.rows.contains(row) ? row : null;
  }

  startRename(id: ID): void {
    const row = this.rowOf(id);
    if (!row || this.renaming) return;
    this.renaming = id;
    const label = q(row, '.cv-layer-label');
    const input = el<HTMLInputElement>('<input class="cv-layer-rename" type="text" spellcheck="false" aria-label="Layer name">');
    input.value = label.textContent ?? '';
    label.hidden = true;
    label.after(input);
    input.focus();
    input.select();
    const done = (commit: boolean): void => {
      if (this.renaming !== id) return;
      this.renaming = null;
      const value = input.value;
      input.remove();
      label.hidden = false;
      if (commit) this.engine.renameLayer(id, value);
      else this.queue();
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); });
    input.addEventListener('blur', () => done(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  private showDrop(target: { id: ID; where: Where } | null): void {
    const line = this.dropLine;
    if (!target) { setClass(line, 'is-shown', false); return; }
    const row = this.rowOf(target.id);
    if (!row) { setClass(line, 'is-shown', false); return; }
    const top = target.where === 'above' ? row.offsetTop - 1 : target.where === 'below' ? row.offsetTop + row.offsetHeight - 1 : row.offsetTop;
    line.style.top = `${top}px`;
    setClass(line, 'is-inside', target.where === 'inside');
    setClass(line, 'is-shown', true);
  }

  private bindRows(): void {
    const rows = this.rows;
    rows.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      const row = t.closest<HTMLElement>('.cv-layer');
      if (!row || e.button !== 0 || this.renaming) return;
      const id = row.dataset.id as ID;
      if (t.closest('.cv-layer-eye')) {
        e.preventDefault();
        const v = this.engine.beginVisibilitySwipe(id);
        if (v === null) return;
        this.swipe = { visible: v, pointerId: e.pointerId };
        rows.setPointerCapture(e.pointerId);
        return;
      }
      if (t.closest('.cv-layer-disclose')) return;
      const p = this.engine.current;
      if (!p) return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      // Option-click on the bottom quarter of a row makes or releases that layer's clipping mask; elsewhere
      // on the row the click selects as usual, so an Option-drag can still drop a duplicate.
      if (e.altKey && !mod && !t.closest('.cv-layer-mask') && this.inClipZone(row, e.clientY)) {
        e.preventDefault();
        this.engine.toggleClip(id);
        return;
      }
      const wasSelected = p.selectedIds.has(id);
      if (mod) this.engine.selectLayer(id, 'toggle');
      else if (e.shiftKey && !t.closest('.cv-layer-mask')) this.engine.selectLayer(id, 'range');
      else if (!wasSelected) this.engine.selectLayer(id);
      else if (p.activeId !== id) { p.activeId = id; this.engine.emit('active', null); }
      if (t.closest('.cv-layer-mask')) {
        if (e.shiftKey) this.engine.toggleMaskEnabled();
        else this.engine.setMaskTarget(true);
      } else if (t.closest('.cv-layer-thumb')) this.engine.setMaskTarget(false);
      const ids = p.selectedIds.has(id) ? [...p.selectedIds] : [id];
      const maskFrom = e.altKey && t.closest('.cv-layer-mask') && p.layer(id)?.mask ? id : null;
      this.drag = { id, ids: maskFrom ? [id] : ids, startY: e.clientY, pointerId: e.pointerId, started: false, wasSelected: wasSelected && !mod && !e.shiftKey, target: null, maskFrom, tabTarget: null };
    });
    rows.addEventListener('pointermove', (e) => {
      if (this.swipe && this.swipe.pointerId === e.pointerId) {
        const row = this.rowAt(e.clientX, e.clientY);
        if (row?.dataset.id) this.engine.swipeVisibility(row.dataset.id, this.swipe.visible);
        return;
      }
      const d = this.drag;
      if (!d) {
        const hover = this.rowAt(e.clientX, e.clientY);
        setClass(rows, 'is-clip-zone', e.altKey && !!hover && !(e.target as HTMLElement).closest('.cv-layer-mask') && this.inClipZone(hover, e.clientY));
      }
      if (!d || d.pointerId !== e.pointerId) return;
      if (!d.started && Math.abs(e.clientY - d.startY) < 4) return;
      if (!d.started) rows.setPointerCapture(e.pointerId);
      d.started = true;
      // A row dragged onto another project's tab copies the layer there.
      const tab = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('.cv-tab') ?? null;
      const key = !d.maskFrom && tab?.dataset.key && tab.dataset.key !== this.engine.current?.id ? tab.dataset.key : null;
      d.tabTarget = key;
      this.showTabDrop(key);
      if (key) { d.target = null; this.showDrop(null); return; }
      const row = this.rowAt(e.clientX, e.clientY);
      if (!row?.dataset.id || d.ids.includes(row.dataset.id)) { d.target = null; this.showDrop(null); return; }
      const r = row.getBoundingClientRect();
      const f = (e.clientY - r.top) / r.height;
      const group = row.classList.contains('is-group');
      if (d.maskFrom) { d.target = group ? null : { id: row.dataset.id, where: 'inside' }; this.showDrop(d.target); return; }
      const where: Where = group && f > 0.25 && f < 0.75 ? 'inside' : f < 0.5 ? 'above' : 'below';
      d.target = { id: row.dataset.id, where };
      this.showDrop(d.target);
    });
    const finish = (e: PointerEvent, cancel: boolean): void => {
      if (this.swipe && this.swipe.pointerId === e.pointerId) {
        this.swipe = null;
        this.engine.endVisibilitySwipe();
        return;
      }
      const d = this.drag;
      if (!d || d.pointerId !== e.pointerId) return;
      this.drag = null;
      this.showDrop(null);
      if (rows.hasPointerCapture(e.pointerId)) rows.releasePointerCapture(e.pointerId);
      if (cancel) return;
      this.showTabDrop(null);
      if (d.started && d.tabTarget) this.engine.copyLayerToProject(d.id, d.tabTarget);
      else if (d.started && d.target) {
        if (d.maskFrom) this.engine.copyMask(d.maskFrom, d.target.id);
        else this.engine.moveLayers(d.ids, d.target.id, d.target.where, e.altKey);
      }
      else if (!d.started && d.wasSelected) this.engine.selectLayer(d.id);
    };
    rows.addEventListener('pointerup', (e) => finish(e, false));
    rows.addEventListener('pointercancel', (e) => finish(e, true));
    rows.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const row = t.closest<HTMLElement>('.cv-layer');
      if (row?.dataset.id && t.closest('.cv-layer-disclose')) this.engine.toggleCollapsed(row.dataset.id);
    });
    rows.addEventListener('dblclick', (e) => {
      const t = e.target as HTMLElement;
      const row = t.closest<HTMLElement>('.cv-layer');
      if (!row?.dataset.id) return;
      if (t.closest('.cv-layer-fx')) row.dispatchEvent(new CustomEvent('cv:edit-layer-style', { bubbles: true, detail: row.dataset.id }));
      if (t.closest('.cv-layer-smart')) row.dispatchEvent(new CustomEvent('cv:smart-filters', { bubbles: true, detail: row.dataset.id }));
      if (t.closest('.cv-layer-vector')) row.dispatchEvent(new CustomEvent('cv:shape-style', { bubbles: true, detail: row.dataset.id }));
      else if (t.closest('.cv-layer-name')) this.startRename(row.dataset.id);
      else if (row.classList.contains('is-text')) document.dispatchEvent(new CustomEvent('cv:type', { detail: { layerId: row.dataset.id } }));
      else if (row.classList.contains('is-adjust')) row.dispatchEvent(new CustomEvent('cv:edit-adjustment', { bubbles: true, detail: row.dataset.id }));
    });
    this.list.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const row = (e.target as HTMLElement).closest<HTMLElement>('.cv-layer');
      const p = this.engine.current;
      if (!row?.dataset.id || !p) return;
      if (!p.selectedIds.has(row.dataset.id)) this.engine.selectLayer(row.dataset.id);
      this.menu.openAt(e.clientX, e.clientY);
    });
  }
}
