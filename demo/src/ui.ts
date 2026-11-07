import { icon } from '../../frontend/src/ui/icons';
import { brandMark } from '../../frontend/src/ui/brand';
import { LAYER_BLEND_MODES, type BlendMode } from '../../frontend/src/engine/types';
import { autoLevels } from '../../frontend/src/engine/adjust';
import { histogram } from '../../frontend/src/engine/filters';
import { VERSION } from '../../frontend/src/version';
import { ADJUST_DEFS, adjustDef, defaults } from './adjust-defs';
import { compose, detached, flatImage } from './compose';
import type { ParamSpec } from '../../frontend/src/engine/adjust-params';
import { controls, esc, h, hex, q, rgb, setText } from './dom';
import { FILTERS, applyPixelOp } from './filters';
import { FORMAT_INFO, MAX_SIDE, download, encode, openFile, placeFile, type ExportFormat } from './io';
import { TRAY, loadPack, packImage, type TrayPhoto } from './media';
import { adjustLayer, cloneCanvas, makeCanvas, maskCanvas, pixelLayer, touch, touchMask, type Doc, type Layer, type PixelLayer, Store } from './model';
import { POSTER_NAME, placeholderDoc, posterDoc } from './poster';
import { blankDoc, sampleDoc } from './sample';
import { TEXT_FAMILIES, defaultText, ensureFont, renderText, type TextSpec } from './text';

type ToolId = 'move' | 'brush' | 'eraser' | 'eyedropper' | 'hand' | 'zoom';
interface ToolDef { id: ToolId; icon: string; label: string; key: string }
const TOOLS: ToolDef[] = [
  { id: 'move', icon: 'tMove', label: 'Move', key: 'V' },
  { id: 'brush', icon: 'tBrush', label: 'Brush', key: 'B' },
  { id: 'eraser', icon: 'tEraser', label: 'Eraser', key: 'E' },
  { id: 'eyedropper', icon: 'tEyedropper', label: 'Eyedropper', key: 'I' },
  { id: 'hand', icon: 'tHand', label: 'Hand', key: 'H' },
  { id: 'zoom', icon: 'tZoom', label: 'Zoom', key: 'Z' },
];

interface MenuItem { label: string; key?: string; run?: () => void; disabled?: () => boolean; heading?: boolean; sep?: boolean }
interface LayerRow { el: HTMLElement; thumb: HTMLCanvasElement; mthumb: HTMLCanvasElement; rev: number; mrev: number }

const SHELL = `
<div class="cv-app" id="dv-app">
  <header class="cv-titlebar">
    <nav class="cv-menubar" id="dv-menubar"></nav>
    <div class="dv-title" id="dv-title"></div>
    <div class="cv-zoom cv-st-tools">
      <button class="cv-icon-btn cv-st-btn" id="dv-undo" type="button" title="Undo (Ctrl+Z)">${icon('undo', 14)}</button>
      <button class="cv-icon-btn cv-st-btn" id="dv-redo" type="button" title="Redo (Ctrl+Shift+Z)">${icon('redo', 14)}</button>
    </div>
  </header>
  <div class="cv-main">
    <div class="cv-doc-tabs"><span class="cv-brand" id="dv-brand"></span><div class="cv-tabs"><div class="cv-tab is-active"><span class="cv-tab-dot"></span><span class="cv-tab-name" id="dv-tabname"></span><span></span></div></div></div>
    <div class="cv-options" id="dv-options"></div>
    <nav class="cv-rail"><div class="cv-rail-tools" id="dv-tools"></div></nav>
    <div class="cv-stage-col">
      <div class="cv-stage" id="dv-stage">
        <div class="dv-view" id="dv-view"><div class="dv-sheet" id="dv-sheet"><canvas class="dv-canvas" id="dv-canvas"></canvas><div class="dv-loading" id="dv-loading" aria-live="polite"><span class="dv-spinner"></span><span>Opening the poster</span></div></div></div>
        <div class="cv-pills"><span class="cv-pill">Drop an image or PSD to open it. Shift-drop places it as a layer.</span></div>
      </div>
    </div>
    <aside class="cv-props-col" id="dv-props">
      <section class="cv-group">
        <div class="cv-group-head"><div class="cv-group-tabs" id="dv-props-tabs"><button class="cv-group-tab is-active" type="button" data-pane="dv-props-body">Properties</button><button class="cv-group-tab" type="button" data-pane="dv-tray">Photos</button></div></div>
        <div class="cv-group-body" id="dv-props-body"></div>
        <div class="cv-group-body dv-tray" id="dv-tray" hidden></div>
      </section>
    </aside>
    <div class="cv-resizer is-inert"></div>
    <aside class="cv-layers">
      <section class="cv-group dv-hist">
        <div class="cv-group-head"><div class="cv-group-tabs"><button class="cv-group-tab is-active" type="button">Histogram</button></div><select class="cv-select" id="dv-hist-channel" aria-label="Histogram channel"><option value="all">RGB</option><option value="lum">Luminosity</option><option value="r">Red</option><option value="g">Green</option><option value="b">Blue</option></select></div>
        <div class="cv-group-body"><canvas class="cv-hist-canvas" id="dv-hist" width="256" height="72"></canvas><div class="cv-hist-stats" id="dv-hist-stats"></div></div>
      </section>
      <section class="cv-group cv-layers-panel">
        <div class="cv-group-head"><div class="cv-group-tabs"><button class="cv-group-tab is-active" type="button">Layers</button></div></div>
        <div class="cv-group-body">
          <div class="cv-layers-page">
            <div class="cv-layer-props"><select class="cv-select" id="dv-blend" aria-label="Blend mode"></select><label class="dv-op"><input id="dv-opacity" type="range" min="0" max="100" step="1" aria-label="Opacity"><output id="dv-opacity-out">100%</output></label></div>
            <div class="cv-layer-list"><div class="cv-layer-rows" id="dv-rows"></div><div class="dv-drop-line" id="dv-drop-line" hidden></div></div>
            <div class="cv-panel-foot" id="dv-foot"></div>
          </div>
        </div>
      </section>
    </aside>
  </div>
  <footer class="cv-status"><span class="cv-st-dims" id="dv-dims"></span><span class="cv-st-zoomtext" id="dv-zoom"></span><span class="cv-st-info" id="dv-info"></span><span class="dv-status-msg" id="dv-msg"></span></footer>
</div>`;

const ICON_FOR_ADJUST = 'sliders';

export function start(): void {
  const app = document.getElementById('app')!;
  app.appendChild(h(SHELL));
  const store = new Store();
  const stage = q(app, '#dv-stage'), viewEl = q(app, '#dv-view'), sheet = q(app, '#dv-sheet');
  const display = q<HTMLCanvasElement>(app, '#dv-canvas');
  const dctx = display.getContext('2d', { willReadFrequently: true })!;
  q(app, '#dv-brand').innerHTML = brandMark(26, 'FormVis');

  const view = { z: 1, x: 0, y: 0 };
  const fg = { value: '#f97316' };
  const brush = { size: 36, hardness: 70, opacity: 100 };
  let tool: ToolId = 'brush';
  let maskTarget = false;

  function toast(text: string): void {
    const root = document.getElementById('toast-root')!;
    const t = h(`<div class="cv-toast"><span class="cv-toast-text">${esc(text)}</span></div>`);
    root.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  const msg = q(app, '#dv-msg');
  const say = (text: string): void => setText(msg, text);

  /* view ------------------------------------------------------------ */
  function applyView(): void {
    sheet.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    sheet.style.setProperty('--dv-z', String(view.z));
    display.classList.toggle('is-pixel', view.z >= 3);
    setText(q(app, '#dv-zoom'), `${Math.round(view.z * 100)}%`);
  }
  function fit(): void {
    const w = viewEl.clientWidth, hh = viewEl.clientHeight, d = store.doc;
    if (!w || !hh) return;
    view.z = Math.max(0.05, Math.min((w - 48) / d.w, (hh - 48) / d.h, 1));
    view.x = (w - d.w * view.z) / 2;
    view.y = (hh - d.h * view.z) / 2;
    applyView();
  }
  function actual(): void {
    const w = viewEl.clientWidth, hh = viewEl.clientHeight, d = store.doc;
    view.z = 1;
    view.x = (w - d.w) / 2;
    view.y = (hh - d.h) / 2;
    applyView();
  }
  function zoomAt(factor: number, cx: number, cy: number): void {
    const nz = Math.min(32, Math.max(0.05, view.z * factor));
    view.x = cx - ((cx - view.x) * nz) / view.z;
    view.y = cy - ((cy - view.y) * nz) / view.z;
    view.z = nz;
    applyView();
  }
  const zoomCenter = (factor: number): void => zoomAt(factor, viewEl.clientWidth / 2, viewEl.clientHeight / 2);
  const toDoc = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = viewEl.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.z, y: (e.clientY - r.top - view.y) / view.z };
  };

  viewEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = viewEl.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey || !e.shiftKey) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - r.left, e.clientY - r.top);
    else { view.x -= e.deltaY; applyView(); }
  }, { passive: false });
  new ResizeObserver(() => { if (fitPending) { fit(); fitPending = false; } }).observe(viewEl);
  let fitPending = true;

  /* render ---------------------------------------------------------- */
  let renderQueued = false, histTimer = 0, lastHistKey = '';
  function requestRender(): void {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; paint(); });
  }
  function paint(): void {
    const d = store.doc;
    if (display.width !== d.w || display.height !== d.h) {
      display.width = d.w;
      display.height = d.h;
      sheet.style.width = `${d.w}px`;
      sheet.style.height = `${d.h}px`;
    }
    const flat = compose(d);
    dctx.clearRect(0, 0, d.w, d.h);
    dctx.drawImage(flat, 0, 0);
    updateThumbs();
    clearTimeout(histTimer);
    histTimer = window.setTimeout(drawHistogram, 180);
    setText(q(app, '#dv-dims'), `${d.w} x ${d.h} px`);
  }

  /* histogram ------------------------------------------------------- */
  const hist = q<HTMLCanvasElement>(app, '#dv-hist'), hctx = hist.getContext('2d')!;
  const histChannel = q<HTMLSelectElement>(app, '#dv-hist-channel');
  function drawHistogram(): void {
    const d = store.doc;
    const img = flatImage(d);
    const bins = histogram(img);
    lastHistKey = histChannel.value;
    const style = getComputedStyle(document.documentElement);
    const lines: Array<[number, string]> = lastHistKey === 'all' ? [[1, '#e5484d'], [2, '#30a46c'], [3, '#3e63dd']] : lastHistKey === 'lum' ? [[0, style.getPropertyValue('--text-secondary') || '#aaa']] : [[{ r: 1, g: 2, b: 3 }[lastHistKey as 'r'], { r: '#e5484d', g: '#30a46c', b: '#3e63dd' }[lastHistKey as 'r']]];
    let max = 1;
    for (const [c] of lines) for (let i = 1; i < 255; i++) max = Math.max(max, bins[c * 256 + i]);
    hctx.clearRect(0, 0, hist.width, hist.height);
    hctx.globalCompositeOperation = lines.length > 1 ? 'lighter' : 'source-over';
    for (const [c, color] of lines) {
      hctx.fillStyle = color;
      hctx.globalAlpha = lines.length > 1 ? 0.55 : 0.8;
      for (let i = 0; i < 256; i++) {
        const v = Math.min(1, bins[c * 256 + i] / max), hh = v * hist.height;
        hctx.fillRect(i, hist.height - hh, 1, hh);
      }
    }
    hctx.globalAlpha = 1;
    hctx.globalCompositeOperation = 'source-over';
    let total = 0, sum = 0;
    for (let i = 0; i < 256; i++) { total += bins[i]; sum += bins[i] * i; }
    setText(q(app, '#dv-hist-stats'), total ? `Mean ${(sum / total).toFixed(1)}  ·  ${Math.round(total).toLocaleString()} px` : 'No pixels');
  }
  histChannel.addEventListener('change', drawHistogram);

  /* layers panel ---------------------------------------------------- */
  const rows = new Map<string, LayerRow>();
  const rowsEl = q(app, '#dv-rows');
  const blendSel = q<HTMLSelectElement>(app, '#dv-blend');
  const opacity = q<HTMLInputElement>(app, '#dv-opacity');
  blendSel.innerHTML = LAYER_BLEND_MODES.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');

  function makeRow(l: Layer): LayerRow {
    const el = h(`<div class="cv-layer" role="option" data-id="${l.id}"><button class="cv-layer-eye" type="button" tabindex="-1" aria-label="Show or hide"><span class="cv-eye-on">${icon('eye', 14)}</span><span class="cv-eye-off">${icon('eyeOff', 14)}</span></button><span class="cv-layer-indent"></span><span></span><canvas class="cv-layer-thumb" width="30" height="30"></canvas><span class="cv-layer-kind">${icon(l.kind === 'adjust' ? ICON_FOR_ADJUST : 'tType', 16)}</span><span class="cv-layer-masks"><canvas class="cv-layer-mask" width="30" height="30"></canvas></span><span class="cv-layer-name"></span></div>`);
    return { el, thumb: q<HTMLCanvasElement>(el, '.cv-layer-thumb'), mthumb: q<HTMLCanvasElement>(el, '.cv-layer-mask'), rev: -1, mrev: -1 };
  }

  function syncRows(): void {
    const layers = [...store.doc.layers].reverse();
    const keep = new Set(layers.map((l) => l.id));
    for (const [id, r] of rows) if (!keep.has(id)) { r.el.remove(); rows.delete(id); }
    let ref: ChildNode | null = rowsEl.firstChild;
    for (const l of layers) {
      let r = rows.get(l.id);
      if (!r) { r = makeRow(l); rows.set(l.id, r); }
      if (r.el === ref) ref = ref.nextSibling; else rowsEl.insertBefore(r.el, ref);
      r.el.classList.toggle('is-active', store.doc.active === l.id);
      r.el.classList.toggle('is-selected', store.doc.active === l.id);
      r.el.classList.toggle('is-hidden', !l.visible);
      r.el.classList.toggle('is-adjust', l.kind === 'adjust');
      r.el.classList.toggle('is-text', l.kind === 'pixel' && l.text !== null);
      r.el.classList.toggle('has-mask', l.kind === 'pixel' && l.mask !== null);
      const onMask = l.kind === 'pixel' && l.mask !== null && store.doc.active === l.id && maskTarget;
      r.el.classList.toggle('is-mask-target', onMask);
      r.el.classList.toggle('is-pixel-target', l.kind === 'pixel' && store.doc.active === l.id && !onMask);
      setText(q(r.el, '.cv-layer-name'), l.name);
    }
    syncLayerProps();
    updateThumbs();
  }

  function updateThumbs(): void {
    for (const l of store.doc.layers) {
      const r = rows.get(l.id);
      if (!r || l.kind !== 'pixel') continue;
      if (r.rev !== l.rev) {
        r.rev = l.rev;
        const g = r.thumb.getContext('2d')!;
        g.clearRect(0, 0, 30, 30);
        const s = Math.min(30 / l.canvas.width, 30 / l.canvas.height), tw = l.canvas.width * s, th = l.canvas.height * s;
        g.drawImage(l.canvas, (30 - tw) / 2, (30 - th) / 2, tw, th);
      }
      if (l.mask && r.mrev !== l.mrev) {
        r.mrev = l.mrev;
        const g = r.mthumb.getContext('2d')!;
        const s = Math.min(30 / l.mask.width, 30 / l.mask.height), tw = l.mask.width * s, th = l.mask.height * s;
        const shape = makeCanvas(30, 30), sg = shape.getContext('2d')!;
        sg.drawImage(l.mask, (30 - tw) / 2, (30 - th) / 2, tw, th);
        sg.globalCompositeOperation = 'source-in';
        sg.fillStyle = '#fff';
        sg.fillRect(0, 0, 30, 30);
        g.fillStyle = '#000';
        g.fillRect(0, 0, 30, 30);
        g.drawImage(shape, 0, 0);
      }
    }
  }

  function syncLayerProps(): void {
    const l = store.active;
    blendSel.disabled = !l || l.kind === 'adjust';
    opacity.disabled = !l;
    if (l) {
      if (blendSel.value !== l.blend) blendSel.value = l.blend;
      const v = String(Math.round(l.opacity * 100));
      if (opacity.value !== v) opacity.value = v;
      setText(q(app, '#dv-opacity-out'), `${v}%`);
    }
  }

  let armed = false;
  const arm = (): void => { if (!armed) { armed = true; store.checkpoint(); } };
  const disarm = (): void => { armed = false; };
  opacity.addEventListener('pointerdown', arm);
  opacity.addEventListener('keydown', arm);
  opacity.addEventListener('change', disarm);
  opacity.addEventListener('input', () => {
    const l = store.active;
    if (!l) return;
    l.opacity = Number(opacity.value) / 100;
    setText(q(app, '#dv-opacity-out'), `${opacity.value}%`);
    requestRender();
  });
  blendSel.addEventListener('change', () => {
    const l = store.active;
    if (!l || l.kind !== 'pixel') return;
    store.checkpoint();
    l.blend = blendSel.value as BlendMode;
    requestRender();
  });

  rowsEl.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.cv-layer');
    if (!row) return;
    const l = store.doc.layers.find((x) => x.id === row.dataset.id);
    if (!l) return;
    if ((e.target as HTMLElement).closest('.cv-layer-eye')) {
      store.checkpoint();
      l.visible = !l.visible;
      syncRows();
      requestRender();
      return;
    }
    maskTarget = l.kind === 'pixel' && l.mask !== null && (e.target as HTMLElement).closest('.cv-layer-masks') !== null;
    store.setActive(l.id);
    syncRows();
  });

  const dropLine = q(app, '#dv-drop-line');
  rowsEl.addEventListener('pointerdown', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.cv-layer');
    if (!row || (e.target as HTMLElement).closest('.cv-layer-eye') || e.button !== 0) return;
    const id = row.dataset.id!;
    const startY = e.clientY;
    let dragging = false, target = -1;
    const move = (ev: PointerEvent): void => {
      if (!dragging && Math.abs(ev.clientY - startY) < 5) return;
      dragging = true;
      const els = Array.from(rowsEl.children) as HTMLElement[];
      let idx = els.length;
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { idx = i; break; }
      }
      target = idx;
      const host = rowsEl.parentElement!.getBoundingClientRect();
      const y = idx < els.length ? els[idx].getBoundingClientRect().top : els[els.length - 1].getBoundingClientRect().bottom;
      dropLine.hidden = false;
      dropLine.style.top = `${y - host.top + rowsEl.parentElement!.scrollTop - 1}px`;
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      dropLine.hidden = true;
      if (!dragging || target < 0) return;
      const total = store.doc.layers.length;
      const from = total - 1 - store.doc.layers.findIndex((l) => l.id === id);
      let to = target;
      if (to > from) to -= 1;
      if (to === from) return;
      store.checkpoint();
      store.move(id, total - 1 - to);
      requestRender();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  /* panel footer ---------------------------------------------------- */
  const foot = q(app, '#dv-foot');
  const footButtons: Array<{ icon: string; title: string; run: () => void }> = [
    { icon: 'add', title: 'New layer', run: () => newLayer() },
    { icon: 'sliders', title: 'New adjustment layer', run: () => openMenu('adjust', q(app, '#dv-foot [data-i="1"]')) },
    { icon: 'duplicate', title: 'Duplicate layer', run: () => duplicateLayer() },
    { icon: 'merge', title: 'Merge down', run: () => mergeDown() },
    { icon: 'chevronUp', title: 'Move up', run: () => shift(1) },
    { icon: 'chevronDown', title: 'Move down', run: () => shift(-1) },
    { icon: 'delete', title: 'Delete layer', run: () => deleteLayer() },
  ];
  footButtons.forEach((b, i) => {
    const btn = h(`<button class="cv-icon-btn" type="button" data-i="${i}" title="${b.title}" aria-label="${b.title}">${icon(b.icon, 16)}</button>`);
    btn.addEventListener('click', b.run);
    foot.appendChild(btn);
  });

  /* layer actions --------------------------------------------------- */
  function newLayer(): void {
    store.checkpoint();
    store.add(pixelLayer(`Layer ${store.doc.layers.length + 1}`, makeCanvas(store.doc.w, store.doc.h)));
    requestRender();
  }
  function duplicateLayer(): void {
    const l = store.active;
    if (!l) return;
    store.checkpoint();
    const copy: Layer = l.kind === 'pixel' ? { ...pixelLayer(`${l.name} copy`, cloneCanvas(l.canvas), l.x, l.y) } : { ...adjustLayer(`${l.name} copy`, l.def, structuredClone(l.values)) };
    if (l.kind === 'pixel' && copy.kind === 'pixel') {
      copy.mask = l.mask ? cloneCanvas(l.mask) : null;
      copy.text = l.text ? { ...l.text } : null;
    }
    copy.opacity = l.opacity;
    copy.blend = l.blend;
    copy.visible = l.visible;
    store.add(copy);
    requestRender();
  }
  function deleteLayer(): void {
    const l = store.active;
    if (!l) return;
    if (store.doc.layers.length === 1) { toast('The last layer stays; a document needs one.'); return; }
    store.checkpoint();
    store.remove(l.id);
    requestRender();
  }
  function shift(by: number): void {
    const l = store.active;
    if (!l) return;
    const i = store.doc.layers.indexOf(l);
    if (i + by < 0 || i + by >= store.doc.layers.length) return;
    store.checkpoint();
    store.move(l.id, i + by);
    requestRender();
  }
  function mergeDown(): void {
    const l = store.active;
    const i = l ? store.doc.layers.indexOf(l) : -1;
    const below = i > 0 ? store.doc.layers[i - 1] : null;
    if (!l || l.kind !== 'pixel' || !below || below.kind !== 'pixel') { toast('Merge Down needs a pixel layer above another pixel layer.'); return; }
    store.checkpoint();
    const pair: Doc = { name: '', w: store.doc.w, h: store.doc.h, layers: [below, l], active: null };
    const merged = detached(pair);
    below.canvas = merged;
    below.x = 0;
    below.y = 0;
    below.blend = 'normal';
    below.opacity = 1;
    below.visible = true;
    below.mask = null;
    below.text = null;
    touch(below);
    store.remove(l.id);
    store.setActive(below.id);
    requestRender();
  }
  function addMask(reveal: boolean): void {
    const l = store.active;
    if (!l || l.kind !== 'pixel') { toast('Select a pixel layer to give it a mask.'); return; }
    if (l.mask) { toast('This layer already has a mask.'); return; }
    store.checkpoint();
    l.mask = maskCanvas(l.canvas.width, l.canvas.height, reveal);
    touchMask(l);
    maskTarget = true;
    store.emit('structure');
    say(reveal ? 'Added a reveal-all mask. Paint with the Eraser to hide, the Brush to reveal.' : 'Added a hide-all mask. Paint with the Brush to reveal.');
    requestRender();
  }
  function deleteMask(): void {
    const l = store.active;
    if (!l || l.kind !== 'pixel' || !l.mask) { toast('The active layer has no mask.'); return; }
    store.checkpoint();
    l.mask = null;
    maskTarget = false;
    store.emit('structure');
    requestRender();
  }
  function invertMask(): void {
    const l = store.active;
    if (!l || l.kind !== 'pixel' || !l.mask) { toast('The active layer has no mask.'); return; }
    store.checkpoint();
    const inv = maskCanvas(l.mask.width, l.mask.height, true), g = inv.getContext('2d')!;
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(l.mask, 0, 0);
    l.mask = inv;
    touchMask(l);
    requestRender();
  }
  function newTextLayer(): void {
    store.checkpoint();
    const spec = defaultText();
    const l = pixelLayer('Text', makeCanvas(store.doc.w, store.doc.h));
    l.text = spec;
    spec.x = Math.round(store.doc.w * 0.08);
    spec.y = Math.round(store.doc.h * 0.1);
    spec.size = Math.max(16, Math.round(store.doc.w * 0.08));
    void ensureFont(spec).then(() => { renderText(spec, l.canvas); touch(l); requestRender(); });
    store.add(l);
    requestRender();
  }
  function flatten(): void {
    store.checkpoint();
    const flat = detached(store.doc);
    const bg = pixelLayer('Background', flat);
    store.doc.layers = [bg];
    store.doc.active = bg.id;
    store.emit('structure');
    requestRender();
  }
  function addAdjust(id: string, extra?: Record<string, unknown>, top = false): void {
    const def = adjustDef(id);
    if (!def) return;
    store.checkpoint();
    if (top && store.doc.layers.length) store.doc.active = store.doc.layers[store.doc.layers.length - 1].id;
    store.add(adjustLayer(def.label, id, { ...defaults(def), ...extra }));
    requestRender();
  }
  function autoTone(mode: 'contrast' | 'color' | 'neutral'): void {
    const ranges = autoLevels(histogram(flatImage(store.doc)), mode);
    const extra: Record<string, unknown> = { black: ranges[0].black, white: ranges[0].white, gamma: ranges[0].gamma };
    if (mode !== 'contrast') extra.channelRanges = [ranges[1], ranges[2], ranges[3]];
    addAdjust('levels', extra, true);
    const l = store.active;
    if (l) l.name = mode === 'contrast' ? 'Auto Contrast' : mode === 'color' ? 'Auto Color' : 'Auto Tone';
    syncRows();
    say(`Added a Levels layer from the histogram (${mode}).`);
  }

  /* document transforms --------------------------------------------- */
  type Orient = 'flipH' | 'flipV' | 'cw' | 'ccw' | 'half';
  function orient(kind: Orient): void {
    store.checkpoint();
    const d = store.doc, W = d.w, H = d.h;
    for (const l of d.layers) {
      if (l.kind !== 'pixel') continue;
      const cw = l.canvas.width, ch = l.canvas.height;
      const swap = kind === 'cw' || kind === 'ccw';
      let nx = l.x, ny = l.y;
      if (kind === 'flipH') nx = W - (l.x + cw);
      else if (kind === 'flipV') ny = H - (l.y + ch);
      else if (kind === 'cw') { nx = H - (l.y + ch); ny = l.x; }
      else if (kind === 'ccw') { nx = l.y; ny = W - (l.x + cw); }
      else { nx = W - (l.x + cw); ny = H - (l.y + ch); }
      const turn = (src: HTMLCanvasElement): HTMLCanvasElement => {
        const out = makeCanvas(swap ? ch : cw, swap ? cw : ch), g = out.getContext('2d')!;
        if (kind === 'flipH') { g.translate(cw, 0); g.scale(-1, 1); }
        else if (kind === 'flipV') { g.translate(0, ch); g.scale(1, -1); }
        else if (kind === 'cw') { g.translate(ch, 0); g.rotate(Math.PI / 2); }
        else if (kind === 'ccw') { g.translate(0, cw); g.rotate(-Math.PI / 2); }
        else { g.translate(cw, ch); g.rotate(Math.PI); }
        g.drawImage(src, 0, 0);
        return out;
      };
      l.canvas = turn(l.canvas);
      if (l.mask) { l.mask = turn(l.mask); touchMask(l); }
      l.text = null;
      l.x = nx;
      l.y = ny;
      touch(l);
    }
    if (kind === 'cw' || kind === 'ccw') { d.w = H; d.h = W; }
    store.emit('structure');
    fit();
    requestRender();
  }
  function resizeDoc(nw: number, nh: number): void {
    store.checkpoint();
    const d = store.doc, sx = nw / d.w, sy = nh / d.h;
    for (const l of d.layers) {
      if (l.kind !== 'pixel') continue;
      const scaled = (src: HTMLCanvasElement): HTMLCanvasElement => {
        const out = makeCanvas(src.width * sx, src.height * sy), g = out.getContext('2d')!;
        g.imageSmoothingQuality = 'high';
        g.drawImage(src, 0, 0, out.width, out.height);
        return out;
      };
      l.canvas = scaled(l.canvas);
      if (l.mask) { l.mask = scaled(l.mask); touchMask(l); }
      l.text = null;
      l.x = Math.round(l.x * sx);
      l.y = Math.round(l.y * sy);
      touch(l);
    }
    d.w = nw;
    d.h = nh;
    store.emit('structure');
    fit();
    requestRender();
  }

  /* properties panel ------------------------------------------------ */
  const propsBody = q(app, '#dv-props-body');
  let propsFor = '';
  function repaintText(l: PixelLayer, spec: TextSpec): void {
    renderText(spec, l.canvas);
    touch(l);
    requestRender();
  }
  function textControls(l: PixelLayer, spec: TextSpec): HTMLElement {
    const root = h('<div class="dv-controls"></div>');
    const area = h(`<label class="cv-field dv-field-top"><span>Text</span><textarea class="cv-input dv-textarea" rows="3" aria-label="Text"></textarea></label>`);
    const ta = q<HTMLTextAreaElement>(area, 'textarea');
    ta.value = spec.text;
    ta.addEventListener('input', () => { arm(); spec.text = ta.value; repaintText(l, spec); });
    ta.addEventListener('change', disarm);
    root.appendChild(area);
    const values: Record<string, unknown> = { family: spec.family, weight: String(spec.weight), size: spec.size, tracking: spec.tracking, color: rgb(spec.color) };
    const specs = [
      { key: 'family', label: 'Font', kind: 'select', options: TEXT_FAMILIES.map((f) => [f, f]), def: spec.family },
      { key: 'weight', label: 'Weight', kind: 'select', options: [['400', 'Regular'], ['600', 'Semibold']], def: String(spec.weight) },
      { key: 'size', label: 'Size', kind: 'range', min: 8, max: 400, step: 1, def: spec.size },
      { key: 'tracking', label: 'Tracking', kind: 'range', min: -10, max: 40, step: 0.5, def: spec.tracking },
      { key: 'color', label: 'Colour', kind: 'color', def: rgb(spec.color) },
    ] as unknown as ParamSpec[];
    const c = controls(specs, values, (k, v) => {
      if (k === 'family') spec.family = String(v);
      else if (k === 'weight') spec.weight = Number(v);
      else if (k === 'size') spec.size = Number(v);
      else if (k === 'tracking') spec.tracking = Number(v);
      else spec.color = hex(v as { r: number; g: number; b: number });
      if (k === 'family' || k === 'weight') void ensureFont(spec).then(() => repaintText(l, spec));
      else repaintText(l, spec);
    }, arm);
    c.root.addEventListener('change', disarm);
    root.appendChild(c.root);
    return root;
  }
  function maskActions(l: PixelLayer): HTMLElement {
    const row = h('<div class="dv-actions"></div>');
    if (!l.mask) row.append(button('Add mask', 'ghost', () => addMask(true)), button('Hide-all mask', 'ghost', () => addMask(false)));
    else row.append(button('Invert mask', 'ghost', invertMask), button('Delete mask', 'ghost', deleteMask));
    return row;
  }
  function syncProps(): void {
    const l = store.active;
    const key = l ? `${l.id}:${l.kind === 'adjust' ? l.def : `p${l.mask ? 'm' : ''}${l.text ? 't' : ''}`}` : '';
    if (key === propsFor) { refreshProps(); return; }
    propsFor = key;
    const next = h('<div class="dv-props-inner"></div>');
    if (!l) next.appendChild(h('<p class="dv-note">No layer selected.</p>'));
    else {
      const name = h<HTMLElement>(`<label class="cv-field"><span>Name</span><input class="cv-input" type="text" value="${esc(l.name)}" aria-label="Layer name"></label>`);
      const input = q<HTMLInputElement>(name, 'input');
      input.addEventListener('focus', arm);
      input.addEventListener('change', disarm);
      input.addEventListener('input', () => { l.name = input.value; setText(q(rows.get(l.id)!.el, '.cv-layer-name'), l.name); });
      next.appendChild(name);
      if (l.kind === 'adjust') {
        const def = adjustDef(l.def)!;
        next.appendChild(h(`<div class="dv-kind">${icon(ICON_FOR_ADJUST, 14)}<span>${esc(def.label)} adjustment</span></div>`));
        if (!def.specs.length) next.appendChild(h('<p class="dv-note">This adjustment has no settings.</p>'));
        else {
          const c = controls(def.specs, l.values, (k, v) => { l.values[k] = v; touch(l); requestRender(); }, arm);
          c.root.addEventListener('change', disarm);
          next.appendChild(c.root);
          const reset = h('<button class="cv-btn dv-reset" type="button">Reset</button>');
          reset.addEventListener('click', () => { store.checkpoint(); l.values = defaults(def); touch(l); c.set(l.values); requestRender(); });
          next.appendChild(reset);
        }
      } else {
        next.appendChild(h(`<div class="dv-kind">${icon(l.text ? 'tType' : 'image', 14)}<span>${l.text ? 'Text layer' : 'Pixel layer'}</span></div>`));
        if (l.text) next.appendChild(textControls(l, l.text));
        next.appendChild(h(`<dl class="dv-facts"><dt>Size</dt><dd>${l.canvas.width} x ${l.canvas.height} px</dd><dt>Offset</dt><dd class="dv-offset">${l.x}, ${l.y}</dd><dt>Mask</dt><dd>${l.mask ? 'Yes' : 'None'}</dd></dl>`));
        next.appendChild(maskActions(l));
        next.appendChild(h(`<p class="dv-note">${l.mask ? 'Click the mask thumbnail to paint on it: the Brush reveals, the Eraser hides.' : 'Paint with the Brush, move with the Move tool, or run a filter from the Filter menu.'}</p>`));
      }
    }
    propsBody.replaceChildren(next);
  }
  function refreshProps(): void {
    const l = store.active;
    const off = propsBody.querySelector('.dv-offset');
    if (l && l.kind === 'pixel' && off) setText(off, `${l.x}, ${l.y}`);
  }

  /* tools ----------------------------------------------------------- */
  const toolsEl = q(app, '#dv-tools');
  const toolButtons = new Map<ToolId, HTMLElement>();
  for (const t of TOOLS) {
    const b = h(`<button class="cv-tool" type="button" title="${t.label} (${t.key})" aria-label="${t.label}">${icon(t.icon, 20)}</button>`);
    b.addEventListener('click', () => setTool(t.id));
    toolsEl.appendChild(b);
    toolButtons.set(t.id, b);
  }
  const optionsEl = q(app, '#dv-options');
  const optionGroups: Record<ToolId, HTMLElement> = {
    move: h('<div class="cv-opt-group"><span class="dv-hint">Drag on the canvas to move the active pixel layer.</span></div>'),
    brush: h(`<div class="cv-opt-group">${sliderOpt('Size', 'dv-size', 1, 300, brush.size)}${sliderOpt('Hardness', 'dv-hard', 0, 100, brush.hardness)}${sliderOpt('Opacity', 'dv-bop', 1, 100, brush.opacity)}<label class="cv-opt"><span>Colour</span><input class="dv-color" id="dv-fg" type="color" value="${fg.value}"></label></div>`),
    eraser: h('<div class="cv-opt-group"><span class="dv-hint">Erases to transparency with the brush size, hardness and opacity.</span></div>'),
    eyedropper: h('<div class="cv-opt-group"><span class="dv-hint">Click the canvas to take a colour from the composite into the brush.</span></div>'),
    hand: h('<div class="cv-opt-group"><span class="dv-hint">Drag to pan. Hold Space with any tool to pan. Scroll to zoom.</span></div>'),
    zoom: h('<div class="cv-opt-group"><span class="dv-hint">Click to zoom in, Alt-click to zoom out.</span></div>'),
  };
  for (const g of Object.values(optionGroups)) { g.hidden = true; optionsEl.appendChild(g); }
  function sliderOpt(label: string, id: string, min: number, max: number, v: number): string {
    return `<label class="cv-opt"><span>${label}</span><input id="${id}" type="range" min="${min}" max="${max}" value="${v}"><output id="${id}-out">${v}</output></label>`;
  }
  const bindSlider = (id: string, key: 'size' | 'hardness' | 'opacity'): void => {
    const input = q<HTMLInputElement>(app, `#${id}`), out = q(app, `#${id}-out`);
    input.addEventListener('input', () => { brush[key] = Number(input.value); setText(out, input.value); tipKey = ''; });
  };
  bindSlider('dv-size', 'size');
  bindSlider('dv-hard', 'hardness');
  bindSlider('dv-bop', 'opacity');
  q<HTMLInputElement>(app, '#dv-fg').addEventListener('input', (e) => { fg.value = (e.target as HTMLInputElement).value; tipKey = ''; });

  function setTool(t: ToolId): void {
    tool = t;
    for (const [id, b] of toolButtons) b.classList.toggle('is-active', id === t);
    for (const [id, g] of Object.entries(optionGroups)) g.hidden = id !== t;
    viewEl.dataset.tool = t;
  }

  let tip: HTMLCanvasElement | null = null, tipKey = '';
  function brushTip(): HTMLCanvasElement {
    const key = `${brush.size}|${brush.hardness}|${fg.value}`;
    if (tip && key === tipKey) return tip;
    tipKey = key;
    const s = Math.max(2, Math.ceil(brush.size));
    tip = makeCanvas(s, s);
    const g = tip.getContext('2d')!, r = s / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    const hard = brush.hardness / 100;
    grad.addColorStop(0, fg.value);
    grad.addColorStop(Math.min(0.999, hard), fg.value);
    const rgbv = [1, 3, 5].map((i) => parseInt(fg.value.slice(i, i + 2), 16));
    grad.addColorStop(1, `rgba(${rgbv[0]},${rgbv[1]},${rgbv[2]},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return tip;
  }
  function dab(l: PixelLayer, x: number, y: number, erase: boolean): void {
    const g = (maskTarget && l.mask ? l.mask : l.canvas).getContext('2d')!;
    const t = erase ? eraseTip() : brushTip();
    g.globalAlpha = brush.opacity / 100;
    g.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    g.drawImage(t, x - l.x - t.width / 2, y - l.y - t.height / 2);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  function touchTarget(l: PixelLayer): void {
    if (maskTarget && l.mask) touchMask(l); else touch(l);
  }
  let eTip: HTMLCanvasElement | null = null, eKey = '';
  function eraseTip(): HTMLCanvasElement {
    const key = `${brush.size}|${brush.hardness}`;
    if (eTip && eKey === key) return eTip;
    eKey = key;
    const s = Math.max(2, Math.ceil(brush.size));
    eTip = makeCanvas(s, s);
    const g = eTip.getContext('2d')!, r = s / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, '#000');
    grad.addColorStop(Math.min(0.999, brush.hardness / 100), '#000');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return eTip;
  }

  /* pointer interaction --------------------------------------------- */
  let spaceDown = false;
  const info = q(app, '#dv-info');
  viewEl.addEventListener('pointermove', (e) => {
    const p = toDoc(e), x = Math.floor(p.x), y = Math.floor(p.y);
    if (x >= 0 && y >= 0 && x < store.doc.w && y < store.doc.h) {
      const px = dctx.getImageData(x, y, 1, 1).data;
      setText(info, `${x}, ${y}   ${px[0]} ${px[1]} ${px[2]} ${px[3]}`);
    } else setText(info, '');
  });
  viewEl.addEventListener('pointerdown', (e) => {
    viewEl.setPointerCapture(e.pointerId);
    const r = viewEl.getBoundingClientRect();
    const panning = e.button === 1 || spaceDown || tool === 'hand';
    if (panning) {
      const sx = e.clientX, sy = e.clientY, ox = view.x, oy = view.y;
      viewEl.classList.add('is-panning');
      const mv = (ev: PointerEvent): void => { view.x = ox + ev.clientX - sx; view.y = oy + ev.clientY - sy; applyView(); };
      const end = (): void => { viewEl.classList.remove('is-panning'); viewEl.removeEventListener('pointermove', mv); viewEl.removeEventListener('pointerup', end); };
      viewEl.addEventListener('pointermove', mv);
      viewEl.addEventListener('pointerup', end);
      return;
    }
    if (tool === 'zoom') { zoomAt(e.altKey ? 0.5 : 2, e.clientX - r.left, e.clientY - r.top); return; }
    if (tool === 'eyedropper') {
      const sample = (ev: PointerEvent): void => {
        const p = toDoc(ev), x = Math.floor(p.x), y = Math.floor(p.y);
        if (x < 0 || y < 0 || x >= store.doc.w || y >= store.doc.h) return;
        const px = dctx.getImageData(x, y, 1, 1).data;
        fg.value = '#' + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        q<HTMLInputElement>(app, '#dv-fg').value = fg.value;
        tipKey = '';
        say(`Picked ${fg.value}`);
      };
      sample(e);
      const mv = (ev: PointerEvent): void => sample(ev);
      const end = (): void => { viewEl.removeEventListener('pointermove', mv); viewEl.removeEventListener('pointerup', end); };
      viewEl.addEventListener('pointermove', mv);
      viewEl.addEventListener('pointerup', end);
      return;
    }
    const l = store.active;
    if (!l || l.kind !== 'pixel') { say('Select a pixel layer to use this tool.'); return; }
    if (tool === 'move') {
      store.checkpoint();
      const sx = e.clientX, sy = e.clientY, ox = l.x, oy = l.y;
      const mv = (ev: PointerEvent): void => { l.x = Math.round(ox + (ev.clientX - sx) / view.z); l.y = Math.round(oy + (ev.clientY - sy) / view.z); refreshProps(); requestRender(); };
      const end = (): void => { viewEl.removeEventListener('pointermove', mv); viewEl.removeEventListener('pointerup', end); };
      viewEl.addEventListener('pointermove', mv);
      viewEl.addEventListener('pointerup', end);
      return;
    }
    if (tool === 'brush' || tool === 'eraser') {
      store.checkpoint();
      const erase = tool === 'eraser';
      let last = toDoc(e);
      dab(l, last.x, last.y, erase);
      touchTarget(l);
      requestRender();
      const mv = (ev: PointerEvent): void => {
        const events = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
        for (const ce of events.length ? events : [ev]) {
          const p = toDoc(ce);
          const dx = p.x - last.x, dy = p.y - last.y, dist = Math.hypot(dx, dy), step = Math.max(1, brush.size * 0.12);
          for (let s = step; s <= dist; s += step) dab(l, last.x + (dx * s) / dist, last.y + (dy * s) / dist, erase);
          if (dist >= step) last = { x: last.x + (dx / dist) * Math.floor(dist / step) * step, y: last.y + (dy / dist) * Math.floor(dist / step) * step };
        }
        touchTarget(l);
        requestRender();
      };
      const end = (): void => { viewEl.removeEventListener('pointermove', mv); viewEl.removeEventListener('pointerup', end); };
      viewEl.addEventListener('pointermove', mv);
      viewEl.addEventListener('pointerup', end);
    }
  });

  /* menus ----------------------------------------------------------- */
  const hasDoc = (): boolean => store.doc.layers.length > 0;
  const menus: Record<string, { label: string; items: () => MenuItem[] }> = {
    file: { label: 'File', items: () => [
      { label: 'Open image or PSD...', key: 'Ctrl+O', run: () => pickFile(false) },
      { label: 'Place image as layer...', run: () => pickFile(true) },
      { label: 'Sample: Above the Clouds poster', run: () => { void openPoster(true); } },
      { label: 'Sample: Harbour at dusk (generated)', run: () => { store.load(sampleDoc(), true); afterLoad('Loaded the generated sample document.'); } },
      { label: 'New blank document...', run: () => newDocDialog() },
      { sep: true, label: '' },
      { label: 'Export...', key: 'Ctrl+E', run: () => exportDialog() },
      { label: 'Quick export PNG', run: () => quickExport('png') },
    ] },
    edit: { label: 'Edit', items: () => [
      { label: 'Undo', key: 'Ctrl+Z', run: () => store.undo(), disabled: () => !store.canUndo },
      { label: 'Redo', key: 'Ctrl+Shift+Z', run: () => store.redo(), disabled: () => !store.canRedo },
    ] },
    image: { label: 'Image', items: () => [
      { label: 'Auto Tone', run: () => autoTone('neutral') },
      { label: 'Auto Contrast', run: () => autoTone('contrast') },
      { label: 'Auto Color', run: () => autoTone('color') },
      { sep: true, label: '' },
      { label: 'Image size...', run: () => resizeDialog() },
      { label: 'Flip horizontal', run: () => orient('flipH') },
      { label: 'Flip vertical', run: () => orient('flipV') },
      { label: 'Rotate 90 clockwise', run: () => orient('cw') },
      { label: 'Rotate 90 counter-clockwise', run: () => orient('ccw') },
      { label: 'Rotate 180', run: () => orient('half') },
    ] },
    layer: { label: 'Layer', items: () => [
      { label: 'New layer', run: newLayer },
      { label: 'Duplicate layer', run: duplicateLayer },
      { label: 'Delete layer', run: deleteLayer },
      { label: 'Merge down', run: mergeDown },
      { label: 'Flatten image', run: flatten },
      { sep: true, label: '' },
      { label: 'New text layer', run: newTextLayer },
      { label: 'Add layer mask', run: () => addMask(true) },
      { label: 'Add hide-all mask', run: () => addMask(false) },
      { label: 'Invert mask', run: invertMask },
      { label: 'Delete mask', run: deleteMask },
      { sep: true, label: '' },
      { label: 'Move up', run: () => shift(1) },
      { label: 'Move down', run: () => shift(-1) },
    ] },
    adjust: { label: 'Adjustment', items: () => ADJUST_DEFS.map((d) => ({ label: d.label, run: () => addAdjust(d.id) })) },
    filter: { label: 'Filter', items: () => [
      ...FILTERS.map((f) => ({ label: `${f.label}...`, run: () => filterDialog(f.id) })),
      { sep: true, label: '' },
      { label: 'Desaturate', run: () => pixelOp('desaturate') },
      { label: 'Equalize', run: () => pixelOp('equalize') },
      { label: 'Invert', run: () => pixelOp('invert') },
    ] },
    view: { label: 'View', items: () => [
      { label: 'Zoom in', key: 'Ctrl+=', run: () => zoomCenter(1.5) },
      { label: 'Zoom out', key: 'Ctrl+-', run: () => zoomCenter(1 / 1.5) },
      { label: 'Fit on screen', key: 'Ctrl+0', run: fit },
      { label: '100%', key: 'Ctrl+1', run: actual },
    ] },
    help: { label: 'Help', items: () => [{ label: 'About this demo', run: () => aboutDialog() }] },
  };
  const menubar = q(app, '#dv-menubar');
  for (const id of ['file', 'edit', 'image', 'layer', 'adjust', 'filter', 'view', 'help']) {
    const b = h(`<button class="cv-menu-btn" type="button" data-menu="${id}">${menus[id].label}</button>`);
    menubar.appendChild(b);
  }
  const flyout = h('<div class="cv-flyout dv-menu" hidden></div>');
  document.getElementById('overlay-root')!.appendChild(flyout);
  let openId = '';
  function closeMenu(): void {
    flyout.hidden = true;
    openId = '';
    menubar.querySelectorAll('.is-open').forEach((n) => n.classList.remove('is-open'));
  }
  function openMenu(id: string, anchor: HTMLElement): void {
    if (openId === id) { closeMenu(); return; }
    closeMenu();
    openId = id;
    const items = menus[id].items();
    flyout.replaceChildren(...items.map((it) => {
      if (it.sep) return h('<div class="dv-menu-sep"></div>');
      const b = h<HTMLButtonElement>(`<button class="cv-flyout-item" type="button"><span></span><span>${esc(it.label)}</span><span class="cv-flyout-key">${esc(it.key ?? '')}</span></button>`);
      b.disabled = it.disabled ? it.disabled() : false;
      b.addEventListener('click', () => { closeMenu(); it.run?.(); });
      return b;
    }));
    const r = anchor.getBoundingClientRect();
    flyout.style.left = `${Math.min(r.left, window.innerWidth - 240)}px`;
    const up = r.top > window.innerHeight * 0.6;
    flyout.style.top = up ? 'auto' : `${r.bottom + 2}px`;
    flyout.style.bottom = up ? `${window.innerHeight - r.top + 2}px` : 'auto';
    flyout.style.maxHeight = `${up ? r.top - 12 : window.innerHeight - r.bottom - 12}px`;
    flyout.hidden = false;
    anchor.classList.add('is-open');
  }
  menubar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.cv-menu-btn');
    if (b) openMenu(b.dataset.menu!, b);
  });
  menubar.querySelectorAll<HTMLElement>('.cv-menu-btn').forEach((b) => b.addEventListener('pointerenter', () => { if (openId && openId !== b.dataset.menu) openMenu(b.dataset.menu!, b); }));
  document.addEventListener('pointerdown', (e) => { if (openId && !(e.target as HTMLElement).closest('.dv-menu, .cv-menubar, .cv-panel-foot')) closeMenu(); });

  q(app, '#dv-undo').addEventListener('click', () => store.undo());
  q(app, '#dv-redo').addEventListener('click', () => store.redo());

  /* dialogs --------------------------------------------------------- */
  interface Dlg { body: HTMLElement; foot: HTMLElement; close: () => void; onClose: (() => void) | null }
  function dialog(title: string, width = 420): Dlg {
    const scrim = h(`<div class="cv-scrim"><div class="cv-dialog" role="dialog" aria-modal="true" tabindex="-1"><div class="cv-dialog-head"><span class="cv-dialog-title">${esc(title)}</span><button class="cv-icon-btn" type="button" data-close title="Close" aria-label="Close">${icon('close', 16)}</button></div><div class="cv-dialog-body"></div><div class="cv-dialog-foot"></div></div></div>`);
    q(scrim, '.cv-dialog').style.setProperty('--cv-dialog-w', `${width}px`);
    document.getElementById('overlay-root')!.appendChild(scrim);
    const d: Dlg = { body: q(scrim, '.cv-dialog-body'), foot: q(scrim, '.cv-dialog-foot'), close: () => { scrim.remove(); document.removeEventListener('keydown', esc2, true); d.onClose?.(); }, onClose: null };
    const esc2 = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); d.close(); } };
    document.addEventListener('keydown', esc2, true);
    q(scrim, '[data-close]').addEventListener('click', () => d.close());
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) d.close(); });
    return d;
  }
  const button = (label: string, kind: 'primary' | 'ghost', run: () => void): HTMLButtonElement => {
    const b = h<HTMLButtonElement>(`<button class="cv-btn cv-btn-${kind}" type="button">${esc(label)}</button>`);
    b.addEventListener('click', run);
    return b;
  };

  function newDocDialog(): void {
    const d = dialog('New document', 380);
    d.body.append(h('<label class="cv-field"><span>Width</span><input class="cv-input" id="nd-w" type="number" min="1" max="4000" value="1200"></label>'), h('<label class="cv-field"><span>Height</span><input class="cv-input" id="nd-h" type="number" min="1" max="4000" value="800"></label>'));
    d.foot.append(button('Cancel', 'ghost', d.close), button('Create', 'primary', () => {
      const w = Math.min(4000, Math.max(1, Number(q<HTMLInputElement>(d.body, '#nd-w').value) | 0)), hh = Math.min(4000, Math.max(1, Number(q<HTMLInputElement>(d.body, '#nd-h').value) | 0));
      store.load(blankDoc(w, hh, 'Untitled'), true);
      d.close();
      afterLoad(`New ${w} x ${hh} document.`);
    }));
  }

  function resizeDialog(): void {
    const d = dialog('Image size', 380);
    const w0 = store.doc.w, h0 = store.doc.h;
    d.body.append(h(`<label class="cv-field"><span>Width (px)</span><input class="cv-input" id="rs-w" type="number" min="1" max="${MAX_SIDE}" value="${w0}"></label>`), h(`<label class="cv-field"><span>Height (px)</span><input class="cv-input" id="rs-h" type="number" min="1" max="${MAX_SIDE}" value="${h0}"></label>`), h('<label class="cv-field cv-toggle-row"><span>Keep proportions</span><input id="rs-k" type="checkbox" checked></label>'));
    const wi = q<HTMLInputElement>(d.body, '#rs-w'), hi = q<HTMLInputElement>(d.body, '#rs-h'), keep = q<HTMLInputElement>(d.body, '#rs-k');
    wi.addEventListener('input', () => { if (keep.checked) hi.value = String(Math.max(1, Math.round((Number(wi.value) * h0) / w0))); });
    hi.addEventListener('input', () => { if (keep.checked) wi.value = String(Math.max(1, Math.round((Number(hi.value) * w0) / h0))); });
    d.foot.append(button('Cancel', 'ghost', d.close), button('Resize', 'primary', () => {
      const nw = Math.min(MAX_SIDE, Math.max(1, Number(wi.value) | 0)), nh = Math.min(MAX_SIDE, Math.max(1, Number(hi.value) | 0));
      d.close();
      resizeDoc(nw, nh);
      say(`Resized to ${nw} x ${nh}.`);
    }));
  }

  function exportDialog(): void {
    const d = dialog('Export', 420);
    d.body.append(
      h(`<label class="cv-field"><span>Format</span><select class="cv-select" id="ex-f">${(Object.keys(FORMAT_INFO) as ExportFormat[]).map((f) => `<option value="${f}">${FORMAT_INFO[f].label}</option>`).join('')}</select></label>`),
      h('<label class="cv-field cv-slider"><span>Quality</span><div class="cv-slider-ctl"><input id="ex-q" type="range" min="1" max="100" value="90"><output id="ex-qo">90</output></div></label>'),
      h('<p class="dv-note" id="ex-note"></p>'),
    );
    const f = q<HTMLSelectElement>(d.body, '#ex-f'), qual = q<HTMLInputElement>(d.body, '#ex-q'), note = q(d.body, '#ex-note');
    let blob: Blob | null = null, token = 0;
    const refresh = async (): Promise<void> => {
      const fmt = f.value as ExportFormat;
      qual.disabled = fmt === 'png' || fmt === 'psd';
      setText(q(d.body, '#ex-qo'), qual.value);
      const my = ++token;
      note.textContent = 'Encoding...';
      try {
        const b = await encode(store.doc, fmt, Number(qual.value) / 100);
        if (my !== token) return;
        blob = b;
        const extra = fmt === 'psd' && store.doc.layers.some((l) => l.kind === 'adjust') ? ' Adjustment layers are baked into the merged preview only.' : '';
        note.textContent = `${store.doc.w} x ${store.doc.h} px, ${(b.size / 1024).toFixed(b.size > 1048576 ? 0 : 1)} KB.${extra}`;
      } catch (err) {
        if (my === token) { blob = null; note.textContent = (err as Error).message; }
      }
    };
    f.addEventListener('change', refresh);
    qual.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(refresh, 200); });
    let timer = 0;
    d.foot.append(button('Cancel', 'ghost', d.close), button('Save', 'primary', () => {
      if (!blob) return;
      download(blob, `${store.doc.name}.${FORMAT_INFO[f.value as ExportFormat].ext}`);
      d.close();
      say('Exported.');
    }));
    void refresh();
  }

  async function quickExport(fmt: ExportFormat): Promise<void> {
    const b = await encode(store.doc, fmt, 0.92);
    download(b, `${store.doc.name}.${FORMAT_INFO[fmt].ext}`);
    say(`Exported ${FORMAT_INFO[fmt].label}, ${(b.size / 1024).toFixed(0)} KB.`);
  }

  function aboutDialog(): void {
    const d = dialog('About this demo', 460);
    d.body.append(
      h(`<div class="cv-welcome-title">${brandMark(28)}FormVis ${VERSION}</div>`),
      h('<p class="dv-note">A browser demo of the FormVis layered image editor. The blend modes, adjustment kernels, filters and histogram are the application\'s own engine modules, run here without the Python engine. PSD files are read and written with ag-psd. Nothing leaves this page.</p>'),
      h('<p class="dv-note">The desktop app adds selections, paths, layer styles, smart objects, local generation and the MCP server. The demo has layer masks and simple text layers of its own. The poster is made from photos by Pexels photographers; each photo is credited in demo/CREDITS.md.</p>'),
    );
    d.foot.append(button('Close', 'primary', d.close));
  }

  function targetPixelLayer(): PixelLayer | null {
    const l = store.active;
    if (!l || l.kind !== 'pixel') { toast('Select a pixel layer first.'); return null; }
    return l;
  }

  function filterDialog(id: string): void {
    const l = targetPixelLayer();
    const def = FILTERS.find((f) => f.id === id);
    if (!l || !def) return;
    store.checkpoint();
    const g = l.canvas.getContext('2d', { willReadFrequently: true })!;
    const original = g.getImageData(0, 0, l.canvas.width, l.canvas.height);
    const values: Record<string, unknown> = {};
    for (const s of def.specs) values[s.key] = s.def;
    const d = dialog(def.label, 400);
    let timer = 0, applied = false;
    const run = (): void => {
      g.putImageData(def.run(original, values), 0, 0);
      touch(l);
      requestRender();
    };
    const c = controls(def.specs, values, (k, v) => { values[k] = v; clearTimeout(timer); timer = window.setTimeout(run, 90); }, () => undefined);
    d.body.appendChild(c.root);
    d.foot.append(button('Cancel', 'ghost', d.close), button('Apply', 'primary', () => { applied = true; d.close(); say(`${def.label} applied to ${l.name}.`); }));
    d.onClose = () => {
      clearTimeout(timer);
      if (applied) { run(); return; }
      g.putImageData(original, 0, 0);
      touch(l);
      store.dropLast();
      requestRender();
    };
    run();
  }

  function pixelOp(kind: 'desaturate' | 'equalize' | 'invert'): void {
    const l = targetPixelLayer();
    if (!l) return;
    store.checkpoint();
    applyPixelOp(l.canvas, kind);
    touch(l);
    requestRender();
  }

  /* files ----------------------------------------------------------- */
  function afterLoad(note: string): void {
    store.doc.layers.length || store.load(blankDoc(1200, 800, 'Untitled'), false);
    fitPending = false;
    rows.forEach((r) => r.el.remove());
    rows.clear();
    syncRows();
    syncProps();
    fit();
    requestRender();
    say(note);
  }
  async function openPoster(keepHistory: boolean): Promise<void> {
    sheet.classList.add('is-loading');
    try {
      const doc = await posterDoc();
      store.load(doc, keepHistory);
      afterLoad(`Opened ${POSTER_NAME}: five photos, three masks, four adjustment layers and four text layers.`);
    } catch (err) {
      toast(`The poster media did not load (${(err as Error).message}). Showing the generated sample instead.`);
      store.load(sampleDoc(), keepHistory);
      afterLoad('Loaded the generated sample document.');
    } finally {
      sheet.classList.remove('is-loading');
    }
  }

  /* photo tray ------------------------------------------------------ */
  const tray = q(app, '#dv-tray');
  tray.appendChild(h('<p class="dv-note">Six more photos from Pexels. Open one as its own document, or place it on the poster as a layer.</p>'));
  const grid = h('<div class="dv-photos"></div>');
  for (const p of TRAY) {
    const card = h(`<article class="dv-photo"><img class="dv-photo-img" src="./assets/media/thumbs/${p.thumb}.jpg" alt="${esc(p.title)}" decoding="async"><div class="dv-photo-meta"><span class="dv-photo-title">${esc(p.title)}</span><span class="dv-photo-by">${esc(p.author)}</span></div><div class="dv-photo-actions"><button class="cv-btn cv-btn-ghost" type="button" data-act="open">Open</button><button class="cv-btn cv-btn-ghost" type="button" data-act="place">Place</button></div></article>`);
    card.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (b) void takeTray(p, b.dataset.act === 'place', card);
    });
    grid.appendChild(card);
  }
  tray.appendChild(grid);
  async function takeTray(p: TrayPhoto, asLayer: boolean, card: HTMLElement): Promise<void> {
    card.classList.add('is-busy');
    try {
      const canvas = await packImage(await loadPack(p.pack));
      if (asLayer) {
        const s = Math.min(1, store.doc.w / canvas.width, store.doc.h / canvas.height);
        const placed = makeCanvas(canvas.width * s, canvas.height * s), g = placed.getContext('2d')!;
        g.imageSmoothingQuality = 'high';
        g.drawImage(canvas, 0, 0, placed.width, placed.height);
        const l = pixelLayer(p.title, placed, Math.round((store.doc.w - placed.width) / 2), Math.round((store.doc.h - placed.height) / 2));
        store.checkpoint();
        store.add(l);
        requestRender();
        say(`Placed ${p.title} as a layer.`);
      } else {
        const l = pixelLayer('Background', canvas);
        store.load({ name: p.title, w: canvas.width, h: canvas.height, layers: [l], active: l.id }, true);
        afterLoad(`Opened ${p.title} at ${canvas.width} by ${canvas.height}.`);
      }
    } catch (err) {
      toast(`Could not open ${p.title}: ${(err as Error).message}`);
    } finally {
      card.classList.remove('is-busy');
    }
  }
  const trayTabs = q(app, '#dv-props-tabs');
  trayTabs.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('.cv-group-tab');
    if (!tab) return;
    for (const t of trayTabs.querySelectorAll<HTMLElement>('.cv-group-tab')) {
      t.classList.toggle('is-active', t === tab);
      q(app, `#${t.dataset.pane}`).hidden = t !== tab;
    }
  });

  const picker = h<HTMLInputElement>('<input type="file" accept="image/*,.psd,.tif,.tiff" multiple hidden>');
  document.body.appendChild(picker);
  let pickAsLayer = false;
  function pickFile(asLayer: boolean): void { pickAsLayer = asLayer; picker.value = ''; picker.click(); }
  picker.addEventListener('change', () => { if (picker.files) void takeFiles(Array.from(picker.files), pickAsLayer); });

  async function takeFiles(files: File[], asLayer: boolean): Promise<void> {
    for (const file of files) {
      try {
        if (asLayer && !/\.psd$/i.test(file.name)) {
          const l = await placeFile(file, store.doc.w, store.doc.h);
          store.checkpoint();
          store.add(l);
          requestRender();
          say(`Placed ${file.name} as a layer.`);
        } else {
          const { doc, note } = await openFile(file);
          store.load(doc, true);
          afterLoad(note);
        }
      } catch (err) {
        toast(`Could not open ${file.name}: ${(err as Error).message}`);
      }
    }
  }
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; stage.classList.add('is-layer-drop'); } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) stage.classList.remove('is-layer-drop'); });
  window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    dragDepth = 0;
    stage.classList.remove('is-layer-drop');
    void takeFiles(Array.from(e.dataTransfer.files), e.shiftKey);
  });

  /* keyboard -------------------------------------------------------- */
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea') && !(target as HTMLInputElement).type?.match(/range|checkbox/)) return;
    if (document.querySelector('#overlay-root .cv-scrim')) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.code === 'Space') { spaceDown = true; viewEl.classList.add('is-space'); e.preventDefault(); return; }
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); store.redo(); return; }
    if (mod && k === 'o') { e.preventDefault(); pickFile(false); return; }
    if (mod && k === 'e') { e.preventDefault(); exportDialog(); return; }
    if (mod && k === '0') { e.preventDefault(); fit(); return; }
    if (mod && k === '1') { e.preventDefault(); actual(); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomCenter(1.5); return; }
    if (mod && k === '-') { e.preventDefault(); zoomCenter(1 / 1.5); return; }
    if (mod || e.altKey) return;
    const t = TOOLS.find((x) => x.key.toLowerCase() === k);
    if (t) { setTool(t.id); return; }
    if (e.key === '[') { brush.size = Math.max(1, brush.size - 6); syncBrushUi(); return; }
    if (e.key === ']') { brush.size = Math.min(300, brush.size + 6); syncBrushUi(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') deleteLayer();
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceDown = false; viewEl.classList.remove('is-space'); } });
  function syncBrushUi(): void {
    q<HTMLInputElement>(app, '#dv-size').value = String(brush.size);
    setText(q(app, '#dv-size-out'), String(brush.size));
    tipKey = '';
  }

  /* store wiring ---------------------------------------------------- */
  store.on((c) => {
    if (c === 'doc') { rows.forEach((r) => r.el.remove()); rows.clear(); propsFor = ''; fitPending = false; fit(); }
    if (c === 'doc' || c === 'structure' || c === 'active') { syncRows(); syncProps(); }
    setText(q(app, '#dv-title'), `${store.doc.name} · FormVis ${VERSION} demo`);
    setText(q(app, '#dv-tabname'), store.doc.name);
    (q(app, '#dv-undo') as HTMLButtonElement).disabled = !store.canUndo;
    (q(app, '#dv-redo') as HTMLButtonElement).disabled = !store.canRedo;
    requestRender();
  });

  store.load(placeholderDoc(), false);
  setTool('move');
  syncRows();
  syncProps();
  fit();
  requestRender();
  sheet.classList.add('is-loading');
  document.body.classList.add('app-ready');
  void openPoster(false);
}
