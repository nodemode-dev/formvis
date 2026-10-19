import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, createSurface, ctxOf } from '../engine';
import type { Engine } from '../engine';
import { histogram } from '../engine/scopes';
import type { DocNote } from '../engine/types';
import { el, patchList, q, setText } from './dom';
import { icon } from './icons';
import { createCloneSourcePanel } from './clone-source-panel';
import { createReferencePanel } from './reference-panel';

/** The channels the Histogram panel can show. */
type Channel = 'rgb' | 'r' | 'g' | 'b' | 'l';
const CHANNELS: ReadonlyArray<{ id: Channel; label: string }> = [
  { id: 'rgb', label: 'RGB' }, { id: 'r', label: 'Red' }, { id: 'g', label: 'Green' }, { id: 'b', label: 'Blue' }, { id: 'l', label: 'Luminosity' },
];
const SAMPLE_MAX = 512;
const MIN_GAP_MS = 250;

/** Section skeleton shared by the three panels: a head with a title and a count, then a body. */
function section(root: HTMLElement, cls: string, title: string, glyph: string, body: string): HTMLElement {
  root.insertAdjacentHTML('beforeend',
    `<section class="cv-preset-panel ${cls}" aria-label="${title}">` +
    `<div class="cv-panel-head"><span class="cv-comps-title">${icon(glyph, 14)}<span>${title}</span></span><span></span><span class="cv-comps-count"></span></div>` +
    body + '</section>');
  return q(root, `section.${cls}`);
}

/** The Adjustments panel (Window menu, DEV_PLAN 36.17): one button per adjustment kind, each running its `new-adj-<kind>`
 *  command. Built once; nothing in it changes afterwards. */
function adjustmentsPanel(root: HTMLElement, run: (id: string) => void): void {
  const tiles = ADJUSTMENT_KINDS.map((k) => `<button class="cv-style-tile" type="button" data-kind="${k}" title="New ${ADJUSTMENT_LABELS[k]} Layer" aria-label="New ${ADJUSTMENT_LABELS[k]} Layer"><span class="cv-style-name">${ADJUSTMENT_LABELS[k]}</span></button>`).join('');
  const sec = section(root, 'cv-adjustments', 'Adjustments', 'layers', `<div class="cv-styles-grid" role="group" aria-label="Adjustments">${tiles}</div>`);
  setText(q(sec, '.cv-comps-count'), String(ADJUSTMENT_KINDS.length));
  sec.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-kind]') : null;
    if (b?.dataset.kind) run(`new-adj-${b.dataset.kind}`);
  });
}

/** The Notes panel: the document's notes, the selected note's text in a textarea (saved on change, one undo step),
 *  Delete and Delete All, and a click pans the view to the note. */
function notesPanel(root: HTMLElement, engine: Engine): void {
  const sec = section(root, 'cv-notes-panel', 'Notes', 'layers',
    '<div class="cv-styles-grid cv-notes-list" role="listbox" aria-label="Notes"></div>' +
    '<textarea class="cv-input cv-notes-text" rows="4" aria-label="Note text" placeholder="Select a note"></textarea>' +
    `<div class="cv-panel-foot"><button class="cv-icon-btn" type="button" data-act="prev" title="Previous note" aria-label="Previous note">${icon('chevronLeft', 16)}</button>` +
    `<button class="cv-icon-btn" type="button" data-act="next" title="Next note" aria-label="Next note">${icon('chevronRight', 16)}</button>` +
    `<button class="cv-icon-btn" type="button" data-act="delete" title="Delete the selected note" aria-label="Delete note">${icon('delete', 16)}</button>` +
    '<button class="cv-btn" type="button" data-act="clear" title="Delete all notes">Delete All</button></div>');
  const list = q(sec, '.cv-notes-list'), count = q(sec, '.cv-comps-count'), ta = q<HTMLTextAreaElement>(sec, '.cv-notes-text');
  const del = q<HTMLButtonElement>(sec, '[data-act="delete"]'), clear = q<HTMLButtonElement>(sec, '[data-act="clear"]');
  const prev = q<HTMLButtonElement>(sec, '[data-act="prev"]'), next = q<HTMLButtonElement>(sec, '[data-act="next"]');
  const notes = (): readonly DocNote[] => engine.current?.doc.notes ?? [];
  const first = (n: DocNote): string => n.text.split('\n')[0].trim() || 'Empty note';

  const fill = (row: HTMLElement, n: DocNote, i: number): void => {
    setText(q(row, '.cv-notes-n'), String(i + 1));
    setText(q(row, '.cv-style-name'), first(n));
    setText(q(row, '.cv-notes-pos'), `${Math.round(n.x)}, ${Math.round(n.y)}`);
    row.classList.toggle('is-active', n.id === engine.activeNote);
    row.setAttribute('aria-selected', String(n.id === engine.activeNote));
  };
  const sync = (): void => {
    const all = notes(), active = all.find((n) => n.id === engine.activeNote);
    setText(count, all.length ? String(all.length) : '');
    patchList<DocNote>(list, [...all], {
      key: (n) => n.id,
      create: (n) => {
        const row = el('<button class="cv-style-tile cv-notes-row" type="button" role="option"><span class="cv-notes-n"></span><span class="cv-style-name"></span><span class="cv-notes-pos"></span></button>');
        row.dataset.id = n.id;
        fill(row, n, all.indexOf(n));
        return row;
      },
      update: (row, n) => fill(row, n, all.indexOf(n)),
    });
    if (ta.disabled !== !active) ta.disabled = !active;
    if (document.activeElement !== ta && ta.value !== (active?.text ?? '')) ta.value = active?.text ?? '';
    if (del.disabled !== !active) del.disabled = !active;
    if (clear.disabled !== (all.length === 0)) clear.disabled = all.length === 0;
    for (const b of [prev, next]) if (b.disabled !== (all.length === 0)) b.disabled = all.length === 0;
  };
  const show = (n: DocNote): void => {
    const v = engine.current?.viewport;
    engine.activeNote = n.id;
    if (v) engine.pan(v.centerX - (v.panX + n.x * v.zoom), v.height / 2 - (v.panY + n.y * v.zoom));
    engine.emit('overlay', null);
    sync();
  };
  list.addEventListener('click', (e) => {
    const row = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-id]') : null;
    const n = row ? notes().find((x) => x.id === row.dataset.id) : undefined;
    if (n) show(n);
  });
  const step = (d: number): void => {
    const all = notes(), at = all.findIndex((n) => n.id === engine.activeNote), n = all[((at < 0 ? (d > 0 ? -1 : 0) : at) + d + all.length) % all.length];
    if (n) show(n);
  };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  ta.addEventListener('change', () => { const id = engine.activeNote; if (id) engine.setNote(id, { text: ta.value }); });
  del.addEventListener('click', () => { const id = engine.activeNote; if (id) engine.removeNote(id); sync(); });
  clear.addEventListener('click', () => { engine.clearNotes(); sync(); });
  for (const ev of ['doc', 'projects', 'history', 'overlay', 'tool'] as const) engine.on(ev, () => sync());
  sec.addEventListener('pointerenter', sync);
  sync();
}

/** Mean, standard deviation and median of a 256-bin histogram. */
function stats(bins: ArrayLike<number>): { n: number; mean: number; sd: number; median: number } {
  let n = 0, s = 0;
  for (let i = 0; i < 256; i++) { n += bins[i]; s += i * bins[i]; }
  if (n === 0) return { n: 0, mean: 0, sd: 0, median: 0 };
  const mean = s / n;
  let v = 0, acc = 0, median = 0, found = false;
  for (let i = 0; i < 256; i++) {
    v += bins[i] * (i - mean) * (i - mean);
    acc += bins[i];
    if (!found && acc >= n / 2) { median = i; found = true; }
  }
  return { n, mean, sd: Math.sqrt(v / n), median };
}

/** The Histogram panel: the composite's histogram of a downsampled copy (at most 512 px on the long side), recomputed on
 *  'render' and 'history' only, at most once per animation frame and once every 250 ms, and only while the panel shows. */
function histogramPanel(root: HTMLElement, engine: Engine): void {
  const sec = section(root, 'cv-histogram-panel', 'Histogram', 'histogram',
    `<select class="cv-input cv-hist-channel" aria-label="Channel">${CHANNELS.map((c) => `<option value="${c.id}">${c.label}</option>`).join('')}</select>` +
    '<canvas class="cv-hist-canvas" width="256" height="100" aria-label="Histogram"></canvas>' +
    '<dl class="cv-hist-stats"><dt>Mean</dt><dd data-s="mean"></dd><dt>Std Dev</dt><dd data-s="sd"></dd><dt>Median value</dt><dd data-s="median"></dd><dt>Pixels</dt><dd data-s="n"></dd></dl>');
  const select = q<HTMLSelectElement>(sec, '.cv-hist-channel'), canvas = q<HTMLCanvasElement>(sec, '.cv-hist-canvas');
  const out = (k: string): HTMLElement => q(sec, `[data-s="${k}"]`);
  let bins: { r: Uint32Array; g: Uint32Array; b: Uint32Array; l: Uint32Array } | null = null;
  let pixels = 0, dirty = true, queued = false, lastRun = 0, timer = 0;

  const draw = (): void => {
    const g = canvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const ch = select.value;
    const on = !!bins && pixels > 0;
    if (!bins || !on) { for (const k of ['mean', 'sd', 'median', 'n']) setText(out(k), ''); return; }
    const H = canvas.height;
    const layers: Array<[Uint32Array, string]> = ch === 'rgb' ? [[bins.r, '#e0453a'], [bins.g, '#3ab55a'], [bins.b, '#4a78e6']]
      : ch === 'r' ? [[bins.r, '#e0453a']] : ch === 'g' ? [[bins.g, '#3ab55a']] : ch === 'b' ? [[bins.b, '#4a78e6']] : [[bins.l, getComputedStyle(canvas).color]];
    let peak = 1;
    for (const [a] of layers) for (let i = 0; i < 256; i++) if (a[i] > peak) peak = a[i];
    g.globalCompositeOperation = ch === 'rgb' ? 'lighter' : 'source-over';
    for (const [a, col] of layers) {
      g.fillStyle = col;
      for (let i = 0; i < 256; i++) { const h = Math.round((a[i] / peak) * (H - 1)); if (h > 0) g.fillRect(i, H - h, 1, h); }
    }
    g.globalCompositeOperation = 'source-over';
    const sum = new Uint32Array(256);
    const src = ch === 'rgb' ? [bins.r, bins.g, bins.b] : ch === 'r' ? [bins.r] : ch === 'g' ? [bins.g] : ch === 'b' ? [bins.b] : [bins.l];
    for (const a of src) for (let i = 0; i < 256; i++) sum[i] += a[i];
    const s = stats(sum);
    setText(out('mean'), s.mean.toFixed(2));
    setText(out('sd'), s.sd.toFixed(2));
    setText(out('median'), String(s.median));
    setText(out('n'), pixels.toLocaleString());
  };

  const compute = (): void => {
    dirty = false;
    lastRun = performance.now();
    const flat = engine.flattened();
    if (!flat || flat.width < 1 || flat.height < 1) { bins = null; pixels = 0; draw(); return; }
    const k = Math.min(1, SAMPLE_MAX / Math.max(flat.width, flat.height));
    const w = Math.max(1, Math.round(flat.width * k)), h = Math.max(1, Math.round(flat.height * k));
    const small = createSurface(w, h), g = ctxOf(small);
    g.drawImage(flat, 0, 0, w, h);
    bins = histogram(g.getImageData(0, 0, w, h));
    pixels = flat.width * flat.height;
    draw();
  };

  const schedule = (): void => {
    dirty = true;
    if (queued || sec.offsetParent === null) return;
    queued = true;
    requestAnimationFrame(() => {
      const wait = MIN_GAP_MS - (performance.now() - lastRun);
      if (wait > 0) { window.clearTimeout(timer); timer = window.setTimeout(() => { queued = false; if (dirty) schedule(); }, wait); return; }
      queued = false;
      if (dirty && sec.offsetParent !== null) compute();
    });
  };

  engine.on('render', () => schedule());
  engine.on('history', () => schedule());
  select.addEventListener('change', draw);
  // A panel shown from the Window menu raises no engine event, so it looks again when it gains a size.
  new ResizeObserver(() => { if (dirty) schedule(); }).observe(sec);
  sec.addEventListener('pointerenter', () => { if (dirty) schedule(); });
}

/** Builds the Adjustments, Notes and Histogram panels into the side column (DEV_PLAN 36.17). `run` runs a catalogue command by id. */
export function createMorePanels(root: HTMLElement, engine: Engine, run: (id: string) => void): void {
  adjustmentsPanel(root, run);
  notesPanel(root, engine);
  histogramPanel(root, engine);
  createCloneSourcePanel(root, engine);
  createReferencePanel(root);
}
