import type { Engine } from '../engine';
import type { Layer, TextSpec } from '../engine/types';
import { setType } from '../extensions/tools/type';
import { axesOf, featuresFromText, featuresToText, variationsFromText, variationsToText } from '../engine/opentype';
import { el, setHidden, setText } from './dom';
import { onLanguage, t } from './i18n';
import { fontFamilies, previewFont } from './fonts';
import { icon } from './icons';
import { PanelGroup } from './panel-group';
import { allBrushPresets, brushGroupOf, importedBrushPresets, type BrushPreset } from '../engine/brush-dynamics';
import { importAbr, moveBrushPreset, renameBrushGroup, renameImportedBrush, saveBrushPreset } from '../io/brush-library';
import { promptName } from './dialogs';

/** The Properties column (Phase 21, UI_SPEC.md sections 5 and 6, the target's s20): Properties (the active layer's
 *  placement: W, X, H, Y, with a link that keeps the aspect), Brushes (the tip, Size and Hardness, a stroke preview, and
 *  Brush Settings), Paragraph (alignment) and Character (font, style, size, leading, tracking, kerning), each bound to
 *  the engine: a committed field is one undo step. Only what formvis's engine does is shown: no dead controls. */

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

/** The theme's text colour as r, g, b, for what is painted on canvases (brush tips, previews): near white in the dark
 *  themes, near black in the light ones, so nothing painted disappears into its background. */
function ink(): [number, number, number] {
  const g = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#f0f0f4';
  const m = /^#([0-9a-f]{6})$/i.exec(String(g.fillStyle));
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : [240, 240, 244];
}
const inkA = (a: number): string => { const [r, g, b] = ink(); return `rgba(${r},${g},${b},${a})`; };

export class PropertiesColumn {
  readonly root: HTMLElement;
  private readonly refreshers: Array<() => void> = [];

  constructor(host: HTMLElement, private readonly engine: Engine, run: (cmd: string) => void, private readonly onLayout: () => void = () => undefined) {
    this.root = host;
    this.properties(run);
    this.brushes(run);
    this.paragraph();
    this.character();
    this.collapsible();
    const refresh = (): void => { for (const r of this.refreshers) r(); };
    // Engine events refresh the column once a frame (1.86.5): Move and Transform send 'options' on every pointer move,
    // and each ran every refresher in the column.
    let queued = 0;
    const soon = (): void => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; refresh(); }); };
    for (const ev of ['active', 'doc', 'history', 'options', 'projects'] as const) engine.on(ev, soon);
    document.addEventListener('cv:type-settings', refresh);
    document.addEventListener('nm:ui-settings-changed', refresh);   // canvases repaint in the new theme's ink
    refresh();
  }

  /** The column collapses to a strip of icons, as the target's (the owner's screenshot): the collapse button in the first
   *  group's header, the expand button atop the strip, and an icon per group that opens the group as a flyout beside
   *  the strip (the group's own element moved there and back, so its tab, values and scroll are kept). Remembered. */
  static readonly COLLAPSED_KEY = 'formvis.propsColCollapsed';
  static collapsed(): boolean { try { return localStorage.getItem(PropertiesColumn.COLLAPSED_KEY) === '1'; } catch { return false; } }
  /** As shown now: the saved choice, or the strip while the window is too narrow for the canvas beside the open column. */
  static showingCollapsed = false;
  /** Below this much canvas beside the open column, the column shows as its strip until the window widens again. */
  static readonly MIN_CANVAS = 420;
  /** Preferences > Workspace: whether a narrow window shows the column as its icons. */
  static narrowCollapse = true;
  /** The open column's width: dragged by its left edge, 220 to 560 px, remembered (the owner's walkthrough). */
  static openWidth(): number { try { const w = Number(localStorage.getItem('formvis.propsOpenW')); return w >= 220 && w <= 560 ? w : 284; } catch { return 284; } }
  private relayoutStrip: () => void = () => undefined;
  /** Panels moved in or out (the Dock): the strip and the collapse button follow. */
  relayout(): void { this.relayoutStrip(); }
  /** Window > Reset Panels: open, at the default width. */
  resetLayout(): void {
    try { localStorage.removeItem(PropertiesColumn.COLLAPSED_KEY); localStorage.removeItem('formvis.propsOpenW'); } catch { /* nothing kept */ }
    document.documentElement.style.setProperty('--cv-props-open-w', '284px');
    this.expand();
  }
  private expand: () => void = () => undefined;
  /** Opens the column out of its strip (1.86.1) and gives Properties the column (1.86.4): a session that lives in
   *  Properties, such as Relight, shows itself even when its group was minimised. `conceal` opens the groups it folded. */
  reveal(): void { this.expand(); PanelGroup.unfocus(this.folded); this.folded = PanelGroup.focusTab('properties'); }
  conceal(): void { PanelGroup.unfocus(this.folded); this.folded = []; }
  private folded: PanelGroup[] = [];

  private collapsible(): void {
    const host = this.root;
    const strip = el(`<div class="cv-props-strip"><button class="cv-strip-btn cv-strip-expand" type="button" title="Expand panels" aria-label="Expand panels">${icon('collapseLeft', 16)}</button></div>`);
    const fly = el('<div class="cv-props-fly" hidden></div>');
    (document.getElementById('overlay-root') ?? document.body).appendChild(fly);
    let open: { group: HTMLElement; mark: Comment; btn: HTMLElement } | null = null;
    const closeFly = (): void => {
      if (!open) return;
      open.mark.replaceWith(open.group);
      open.btn.classList.remove('is-on');
      open = null;
      setHidden(fly, true);
    };
    // The strip lists what the column holds now: its own groups, and any dock panel moved in (Dock); relayout() rebuilds it.
    const ICONS: Record<string, [string, string]> = { properties: ['panelProps', 'Properties'], brushes: ['tBrush', 'Brushes'], paragraph: ['pilcrow', 'Paragraph'], character: ['charA', 'Character'],
      navigator: ['panelNav', 'Navigator'], swatches: ['swatchGrid', 'Swatches'], 'layers-panel': ['layers', 'Layers'], timeline: ['film', 'Timeline'], history: ['history', 'History'] };
    const collapse = el<HTMLButtonElement>(`<button class="cv-group-collapse" type="button" title="Collapse to icons" aria-label="Collapse to icons">${icon('collapseRight', 14)}</button>`);
    this.relayoutStrip = (): void => {
      closeFly();
      for (const b of Array.from(strip.querySelectorAll('.cv-strip-btn:not(.cv-strip-expand)'))) b.remove();
      const sections = Array.from(host.querySelectorAll<HTMLElement>(':scope > section')).filter((g) => !g.hidden);
      for (const g of sections) {
        const id = Array.from(g.classList).find((c) => c.startsWith('cv-') && c !== 'cv-group')?.slice(3) ?? '';
        const [ic, label] = ICONS[id] ?? ['panelProps', id];
        const b = el<HTMLButtonElement>(`<button class="cv-strip-btn" type="button" title="${label}" aria-label="${label}">${icon(ic, 18)}</button>`);
        b.dataset.group = id === 'layers-panel' ? 'layers' : id;
        b.addEventListener('click', () => {
          if (open?.group === g) { closeFly(); return; }
          closeFly();
          const mark = document.createComment(id);
          g.replaceWith(mark);
          fly.appendChild(g);
          setHidden(fly, false);
          open = { group: g, mark, btn: b };
          b.classList.add('is-on');
          const r = b.getBoundingClientRect(), st = strip.getBoundingClientRect();
          fly.style.right = `${Math.round(window.innerWidth - st.left + 6)}px`;
          fly.style.top = `${Math.round(Math.max(8, Math.min(r.top, window.innerHeight - fly.offsetHeight - 8)))}px`;
        });
        strip.appendChild(b);
      }
      // The collapse button on the first panel's header, whichever it is now.
      const head = sections[0]?.querySelector<HTMLElement>(':scope > .cv-panel-head');
      if (head && collapse.parentElement !== head) { const min = head.querySelector('.cv-group-min'); if (min) min.after(collapse); else head.appendChild(collapse); }
    };
    host.prepend(strip);
    document.addEventListener('pointerdown', (e) => { if (open && !fly.contains(e.target as Node) && !strip.contains(e.target as Node)) closeFly(); }, true);
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') closeFly(); });
    // The choice is saved; what shows also depends on room: too narrow a window shows the strip, the choice kept.
    let narrow = false;
    const show = (): void => {
      const on = PropertiesColumn.collapsed() || narrow;
      if (on !== PropertiesColumn.showingCollapsed || host.classList.contains('is-collapsed') !== on) { closeFly(); host.classList.toggle('is-collapsed', on); PropertiesColumn.showingCollapsed = on; this.onLayout(); }
    };
    const measure = (): void => {
      const col = host.parentElement?.querySelector<HTMLElement>(':scope > .cv-stage-col');
      const openW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cv-props-open-w')) || 284;
      narrow = PropertiesColumn.narrowCollapse && !!col && col.clientWidth - (openW - 46) < PropertiesColumn.MIN_CANVAS;
      show();
    };
    window.addEventListener('resize', measure);
    requestAnimationFrame(measure);
    const set = (on: boolean): void => {
      try { localStorage.setItem(PropertiesColumn.COLLAPSED_KEY, on ? '1' : '0'); } catch { /* this session only */ }
      if (!on) narrow = false;   // expanding by hand is honoured, narrow or not
      show();
    };
    (strip.querySelector('.cv-strip-expand') as HTMLElement).addEventListener('click', () => set(false));
    this.expand = () => set(false);
    collapse.addEventListener('click', () => set(true));
    this.relayoutStrip();
    // The width: a handle on the open column's left edge.
    document.documentElement.style.setProperty('--cv-props-open-w', `${PropertiesColumn.openWidth()}px`);
    const grip = el('<div class="cv-props-resize" role="separator" aria-orientation="vertical" aria-label="Resize the panel column"></div>');
    host.appendChild(grip);
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const x0 = e.clientX, w0 = PropertiesColumn.openWidth();
      const move = (ev: PointerEvent): void => {
        const w = Math.round(Math.min(560, Math.max(220, w0 + (x0 - ev.clientX))));
        document.documentElement.style.setProperty('--cv-props-open-w', `${w}px`);
        try { localStorage.setItem('formvis.propsOpenW', String(w)); } catch { /* this session only */ }
        this.onLayout();
      };
      const up = (): void => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up);
    });
    PropertiesColumn.showingCollapsed = PropertiesColumn.collapsed();
    host.classList.toggle('is-collapsed', PropertiesColumn.showingCollapsed);
  }

  private properties(run: (cmd: string) => void): void {
    const e = this.engine;
    const body = el(`<div class="cv-props">
      <div class="cv-props-head"><span class="cv-props-tile"></span><span class="cv-props-name"></span></div>
      <button class="cv-props-section" type="button" aria-expanded="true">${icon('chevronDown', 12)}<span>Transform</span></button>
      <div class="cv-props-transform"><button class="cv-link-btn is-on" type="button" title="Keep the aspect" aria-pressed="true">${icon('link', 14)}</button><div class="cv-props-grid"></div></div>
      <p class="cv-props-none">Select a layer with pixels to see its placement.</p>
      <button class="cv-props-section cv-props-mask-head" type="button" aria-expanded="true" hidden>${icon('chevronDown', 12)}<span>Layer Mask</span></button>
      <div class="cv-props-transform cv-props-mask" hidden><div class="cv-props-grid"></div></div>
      <div class="cv-props-transform cv-props-mask-acts" hidden><button class="cv-btn" type="button" data-pcmd="mask-invert">Invert</button><button class="cv-btn" type="button" data-pcmd="select-and-mask">Select and Mask...</button></div>
      <button class="cv-props-section cv-props-vmask-head" type="button" aria-expanded="true" hidden>${icon('chevronDown', 12)}<span>Vector Mask</span></button>
      <div class="cv-props-transform cv-props-vmask" hidden><div class="cv-props-grid"></div></div>
      <div class="cv-props-transform cv-props-vmask-acts" hidden><button class="cv-btn" type="button" data-pcmd="vmask-invert">Invert</button></div>
      <button class="cv-props-section cv-props-doc-head" type="button" aria-expanded="true">${icon('chevronDown', 12)}<span>Document</span></button>
      <dl class="cv-props-doc"><dt>Name</dt><dd data-doc="name"></dd><dt>Size</dt><dd data-doc="size"></dd><dt>Resolution</dt><dd data-doc="res"></dd><dt>Mode</dt><dd data-doc="mode"></dd><dt>Profile</dt><dd data-doc="profile"></dd><dt>Layers</dt><dd data-doc="layers"></dd></dl>
    </div>`);
    const docHead = body.querySelector('.cv-props-doc-head') as HTMLButtonElement, docList = body.querySelector('.cv-props-doc') as HTMLElement;
    docHead.addEventListener('click', () => { const open = docHead.getAttribute('aria-expanded') !== 'true'; docHead.setAttribute('aria-expanded', String(open)); setHidden(docList, !open); });
    const docCell = (k: string): HTMLElement => docList.querySelector(`[data-doc="${k}"]`) as HTMLElement;
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
    // The active layer's mask: Density lightens its black areas, Feather softens its edge; neither changes the painted mask.
    const maskHead = body.querySelector('.cv-props-mask-head') as HTMLButtonElement, maskBody = body.querySelector('.cv-props-mask') as HTMLElement;
    maskHead.addEventListener('click', () => { const open = maskHead.getAttribute('aria-expanded') !== 'true'; maskHead.setAttribute('aria-expanded', String(open)); setHidden(maskBody, !open); });
    const mf = { density: numField('%', 'Mask Density', 0, 100, 1, (v) => e.setMaskShape({ density: v })), feather: numField('px', 'Mask Feather', 0, 250, 1, (v) => e.setMaskShape({ feather: v })) };
    for (const [k, lbl] of [['density', 'Density'], ['feather', 'Feather']] as const) {
      const row = el(`<label class="cv-props-field"><span>${lbl}</span></label>`);
      row.appendChild(mf[k].root);
      maskBody.querySelector('.cv-props-grid')?.appendChild(row);
    }
    const maskActs = body.querySelector('.cv-props-mask-acts') as HTMLElement;
    const vHead = body.querySelector('.cv-props-vmask-head') as HTMLButtonElement, vBody = body.querySelector('.cv-props-vmask') as HTMLElement, vActs = body.querySelector('.cv-props-vmask-acts') as HTMLElement;
    vHead.addEventListener('click', () => { const open = vHead.getAttribute('aria-expanded') !== 'true'; vHead.setAttribute('aria-expanded', String(open)); setHidden(vBody, !open); setHidden(vActs, !open); });
    maskHead.addEventListener('click', () => setHidden(maskActs, maskHead.getAttribute('aria-expanded') !== 'true'));
    const vf = { density: numField('%', 'Vector Mask Density', 0, 100, 1, (v) => e.setVectorMaskShape({ density: v })), feather: numField('px', 'Vector Mask Feather', 0, 250, 1, (v) => e.setVectorMaskShape({ feather: v })) };
    for (const [k, lbl] of [['density', 'Density'], ['feather', 'Feather']] as const) {
      const row = el(`<label class="cv-props-field"><span>${lbl}</span></label>`);
      row.appendChild(vf[k].root);
      vBody.querySelector('.cv-props-grid')?.appendChild(row);
    }
    for (const b of body.querySelectorAll<HTMLButtonElement>('[data-pcmd]')) {
      b.addEventListener('click', () => {
        const cmd = b.dataset.pcmd as string;
        if (cmd === 'select-and-mask' && !e.current?.selection) e.loadSelection({ channel: 'mask' });
        run(cmd);
      });
    }
    const tile = body.querySelector('.cv-props-tile') as HTMLElement, name = body.querySelector('.cv-props-name') as HTMLElement;
    new PanelGroup(this.root, 'properties', [{ id: 'properties', label: 'Properties', body }], 'Properties');
    onLanguage(() => { for (const r of this.refreshers) r(); });   // the heading is set in place, in the new language
    this.refreshers.push(() => {
      const a = e.activeLayer, l = layer();
      // Written only when the kind changes (1.50.3): rewriting it on every refresh rebuilt the icon, a flash.
      const want = a ? kindIcon(a) : '';
      if (tile.dataset.icon !== want) { tile.dataset.icon = want; tile.innerHTML = want ? icon(want, 18) : ''; }
      setText(name, a ? t('{name} Properties').replace('{name}', t(a.name)) : t('No layer selected'));
      // The section keeps its place whatever is selected (its fields disabled when there is nothing to place), so the
      // groups beneath never jump when a document opens or the selection changes; only the fold changes its height.
      setHidden(tr, section.getAttribute('aria-expanded') !== 'true');
      setHidden(section, false);
      setHidden(none, true);
      for (const k of ['w', 'x', 'h', 'y'] as const) f[k].set(l ? l.transform[k] : null);
      const mk = a?.mask ?? null;
      setHidden(maskHead, !mk);
      setHidden(maskBody, !mk || maskHead.getAttribute('aria-expanded') !== 'true');
      mf.density.set(mk ? mk.density ?? 100 : null);
      mf.feather.set(mk ? mk.feather ?? 0 : null);
      setHidden(maskActs, !mk || maskHead.getAttribute('aria-expanded') !== 'true');
      const vk = a?.vectorMask ?? null;
      setHidden(vHead, !vk);
      setHidden(vBody, !vk || vHead.getAttribute('aria-expanded') !== 'true');
      setHidden(vActs, !vk || vHead.getAttribute('aria-expanded') !== 'true');
      vf.density.set(vk ? vk.density ?? 100 : null);
      vf.feather.set(vk ? vk.feather ?? 0 : null);
      const cur = e.current, d = cur?.doc, dash = '-';
      setText(docCell('name'), cur?.name ?? dash);
      setText(docCell('size'), d ? `${d.width} x ${d.height} px` : dash);
      setText(docCell('res'), d ? `${Math.round(d.resolution * 100) / 100} ppi` : dash);
      setText(docCell('mode'), d ? `${({ rgb: 'RGB', grayscale: 'Grayscale', bitmap: 'Bitmap', indexed: 'Indexed', cmyk: 'CMYK', lab: 'Lab', duotone: 'Duotone', multichannel: 'Multichannel' } as Record<string, string>)[d.mode ?? 'rgb']}, ${d.depth ?? 8} bit` : dash);
      setText(docCell('profile'), d ? d.profile?.name ?? 'None' : dash);
      setText(docCell('layers'), d ? String(d.layers.length) : dash);
    });
  }

  /** Brushes as the target's (s20): the tip and Size and Hardness; a search and a grid or list of the presets in
   *  folders (formvis's own, and those loaded from .abr files), each drawn with its size, the chosen one marked; the stroke
   *  preview; Load... (.abr brushes) and Brush Settings. A Brush Settings tab holds the tip's spacing, angle
   *  and roundness, the units of the full dialog. */
  private brushes(run: (cmd: string) => void): void {
    const e = this.engine;
    const body = el(`<div class="cv-brushes">
      <div class="cv-brush-top"><canvas class="cv-brush-tip" aria-label="Brush tip"></canvas><div class="cv-brush-sliders"></div></div>
      <div class="cv-brush-find"><label class="cv-brush-search">${icon('search', 14)}<input type="search" placeholder="Search brushes" aria-label="Search brushes"></label>
        <div class="cv-brush-views" role="group" aria-label="View"><button type="button" data-view="grid" title="Grid" aria-label="Grid">${icon('viewGrid', 15)}</button><button type="button" data-view="list" title="List" aria-label="List">${icon('viewList', 15)}</button></div></div>
      <div class="cv-brush-folders"></div>
      <div class="cv-brush-stroke-head"><span>Custom brush</span><span>Stroke preview</span></div><canvas class="cv-brush-stroke" aria-label="Stroke preview"></canvas>
      <div class="cv-brush-actions"><button class="cv-btn" type="button" data-act="new" title="Save the current brush as a preset">${icon('plus', 14)}<span>New Preset</span></button><button class="cv-btn" type="button" data-act="load">${icon('folderOpen', 14)}<span>Load...</span></button><button class="cv-btn" type="button" data-act="settings">${icon('sliders', 14)}<span>Brush Settings</span></button></div>
    </div>`);
    const sliders = body.querySelector('.cv-brush-sliders') as HTMLElement, folders = body.querySelector('.cv-brush-folders') as HTMLElement;
    const tip = body.querySelector('.cv-brush-tip') as HTMLCanvasElement, stroke = body.querySelector('.cv-brush-stroke') as HTMLCanvasElement;
    const search = body.querySelector('.cv-brush-find input') as HTMLInputElement;
    const LOG = Math.log(1000);
    const setters: Array<() => void> = [];
    const sliderRow = (label: string, unit: string, min: number, max: number, get: () => number, put: (v: number) => void, toS: (v: number) => number, fromS: (s: number) => number, host: HTMLElement): void => {
      const row = el(`<div class="cv-brush-row"><div class="cv-brush-row-head"><span>${label}:</span></div><input class="cv-slider" type="range" min="0" max="1000" step="1" aria-label="${label}"></div>`);
      const field = numField(unit, label, min, max, 1, put), slider = row.querySelector('input') as HTMLInputElement;
      (row.querySelector('.cv-brush-row-head') as HTMLElement).appendChild(field.root);
      slider.addEventListener('input', () => put(Math.min(max, Math.max(min, fromS(Number(slider.value))))));
      setters.push(() => { field.set(get()); if (document.activeElement !== slider) slider.value = String(Math.round(toS(Math.max(min, get())))); });
      host.appendChild(row);
    };
    sliderRow('Size', 'px', 1, 1000, () => e.brush.diameter, (v) => e.setBrush({ diameter: Math.round(v) }), (v) => (Math.log(v) / LOG) * 1000, (s) => Math.exp((s / 1000) * LOG), sliders);
    sliderRow('Hardness', '%', 0, 100, () => e.brush.hardness * 100, (v) => e.setBrush({ hardness: v / 100 }), (v) => v * 10, (s) => s / 10, sliders);
    // The tab of the tip's own settings, in the full dialog's units.
    const settings = el('<div class="cv-brushes cv-brush-shape"></div>');
    const shape = (patch: Partial<typeof e.brushShape>): void => { e.brushShape = { ...e.brushShape, ...patch }; e.emit('options', null); };
    sliderRow('Spacing', '%', 1, 1000, () => e.brushShape.spacing ?? 25, (v) => shape({ spacing: Math.round(v) }), (v) => (Math.log(v) / LOG) * 1000, (s) => Math.exp((s / 1000) * LOG), settings);
    sliderRow('Angle', '°', -180, 180, () => e.brushShape.angle, (v) => shape({ angle: Math.round(v) }), (v) => ((v + 180) / 360) * 1000, (s) => (s / 1000) * 360 - 180, settings);
    sliderRow('Roundness', '%', 1, 100, () => e.brushShape.roundness, (v) => shape({ roundness: Math.round(v) }), (v) => v * 10, (s) => s / 10, settings);
    const more = el<HTMLButtonElement>(`<button class="cv-btn cv-brush-more" type="button">${icon('sliders', 14)}<span>All brush settings...</span></button>`);
    more.addEventListener('click', () => run('brush-settings'));
    settings.appendChild(more);
    new PanelGroup(this.root, 'brushes', [{ id: 'brushes', label: 'Brushes', body }, { id: 'brush-settings', label: 'Brush Settings', body: settings }], 'Brushes').setMenu(() => ['load-brushes', 'brush-settings']);

    let view: 'grid' | 'list' = 'grid';
    try { view = localStorage.getItem('formvis.brushView') === 'list' ? 'list' : 'grid'; } catch { /* grid */ }
    const shut = new Set<string>();
    for (const b of body.querySelectorAll<HTMLButtonElement>('[data-view]')) b.addEventListener('click', () => { view = b.dataset.view as 'grid' | 'list'; try { localStorage.setItem('formvis.brushView', view); } catch { /* session */ } key = ''; fill(); });
    search.addEventListener('input', () => { key = ''; fill(); });
    const thumbs = new Map<HTMLCanvasElement, BrushPreset>();
    const paintThumb = (c: HTMLCanvasElement, p: BrushPreset): void => {
      const dpr = window.devicePixelRatio || 1;
      const g = c.getContext('2d') as CanvasRenderingContext2D, R = Math.min(c.height * 0.42, Math.max(3 * dpr, (Math.log(p.diameter + 1) / Math.log(1001)) * c.height * 0.9));
      g.clearRect(0, 0, c.width, c.height);
      if (p.tip) {
        const INK = ink();
        const t = document.createElement('canvas'); t.width = p.tip.w; t.height = p.tip.h;
        const img = new ImageData(p.tip.w, p.tip.h);
        for (let i = 0; i < p.tip.data.length; i++) { const [ir, ig, ib] = INK; img.data[i * 4] = ir; img.data[i * 4 + 1] = ig; img.data[i * 4 + 2] = ib; img.data[i * 4 + 3] = p.tip.data[i]; }
        t.getContext('2d')?.putImageData(img, 0, 0);
        const s = (R * 2) / Math.max(p.tip.w, p.tip.h);
        g.drawImage(t, c.width / 2 - (p.tip.w * s) / 2, c.height / 2 - (p.tip.h * s) / 2, p.tip.w * s, p.tip.h * s);
      } else {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
        gr.addColorStop(0, inkA(1)); gr.addColorStop(Math.min(0.999, Math.max(0, p.hardness)), inkA(1)); gr.addColorStop(1, inkA(0));
        g.save(); g.translate(c.width / 2, c.height / 2); g.rotate((-(p.angle ?? 0) * Math.PI) / 180); g.scale(1, Math.max(0.05, (p.roundness ?? 100) / 100));   // its own shape
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill(); g.restore();
      }
    };
    const thumb = (p: BrushPreset, w: number, h: number): HTMLCanvasElement => {
      const dpr = window.devicePixelRatio || 1, c = document.createElement('canvas');
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = `${w}px`; c.style.height = `${h}px`;
      thumbs.set(c, p);
      paintThumb(c, p);
      return c;
    };
    let key = '', inkSeen = '', dragId: string | null = null;
    const fill = (): void => {
      const q0 = search.value.trim().toLowerCase(), imported = new Set(importedBrushPresets.map((p) => p.id));
      const k = [view, q0, e.brushPresetId, [...shut].join(','), allBrushPresets().map((p) => `${p.id}:${brushGroupOf(p)}:${p.name}`).join(',')].join('|');
      const inkNow = ink().join(',');
      if (k === key) {
        if (inkNow !== inkSeen) { inkSeen = inkNow; for (const [c, p] of thumbs) paintThumb(c, p); }   // a new theme's ink repaints the tiles in place
        return;
      }
      key = k; inkSeen = inkNow;
      thumbs.clear();
      for (const b of body.querySelectorAll<HTMLElement>('[data-view]')) b.classList.toggle('is-on', b.dataset.view === view);
      folders.textContent = '';
      const byGroup = new Map<string, BrushPreset[]>();
      for (const p of allBrushPresets()) { const g = brushGroupOf(p); byGroup.set(g, [...(byGroup.get(g) ?? []), p]); }
      const groups = [...byGroup].map(([g, list]) => ({ id: g, name: t(g), raw: g, list }));
      const dropOn = (node: HTMLElement, group: string, before: string | null): void => {
        node.addEventListener('dragover', (ev) => { if (dragId) { ev.preventDefault(); node.classList.add('is-drop'); } });
        node.addEventListener('dragleave', () => node.classList.remove('is-drop'));
        node.addEventListener('drop', (ev) => { ev.preventDefault(); node.classList.remove('is-drop'); const id = dragId; dragId = null; if (id) void moveBrushPreset(id, group, before).then(() => { key = ''; fill(); }); });
      };
      for (const grp of groups) {
        const list = grp.list.filter((p) => !q0 || p.name.toLowerCase().includes(q0));
        if (!list.length) continue;
        const open = !shut.has(grp.id) || !!q0;
        const head = el<HTMLButtonElement>(`<button class="cv-brush-folder" type="button" aria-expanded="${open}">${icon('chevronDown', 12)}${icon('folder', 15)}<span class="cv-bf-name"></span><em></em></button>`);
        setText(head.querySelector('.cv-bf-name') as HTMLElement, grp.name);
        setText(head.querySelector('em') as HTMLElement, String(list.length));
        head.addEventListener('click', () => { if (shut.has(grp.id)) shut.delete(grp.id); else shut.add(grp.id); key = ''; fill(); });
        dropOn(head, grp.raw, null);
        if (grp.list.some((p) => imported.has(p.id))) {
          head.title = 'Double-click to rename the folder';
          head.addEventListener('dblclick', () => { void promptName('Rename Folder', grp.raw, 'Rename').then((n) => (n ? renameBrushGroup(grp.raw, n) : false)).then(() => { key = ''; fill(); }); });
        }
        folders.appendChild(head);
        if (!open) continue;
        const box = el(`<div class="cv-brush-${view}"></div>`);
        for (const p of list) {
          const tile = el<HTMLButtonElement>(`<button class="cv-brush-tile" type="button"><span class="cv-brush-name"></span><span class="cv-brush-size"></span></button>`);
          tile.prepend(thumb(p, view === 'grid' ? 40 : 30, view === 'grid' ? 30 : 22));
          setText(tile.querySelector('.cv-brush-name') as HTMLElement, p.name);
          setText(tile.querySelector('.cv-brush-size') as HTMLElement, `${p.diameter} px`);
          tile.title = `${p.name} · ${p.diameter} px`;
          tile.setAttribute('aria-label', p.name);
          tile.classList.toggle('is-on', e.brushPresetId === p.id);
          tile.addEventListener('click', () => { e.applyBrushPreset(p); key = ''; fill(); });
          if (imported.has(p.id)) {
            tile.draggable = true;
            tile.title += ' · drag to reorder or move to a folder · double-click to rename';
            tile.addEventListener('dragstart', (ev) => { dragId = p.id; ev.dataTransfer?.setData('text/plain', p.id); });
            tile.addEventListener('dragend', () => { dragId = null; });
            tile.addEventListener('dblclick', () => { void promptName('Rename Brush', p.name, 'Rename').then((n) => (n ? renameImportedBrush(p.id, n) : false)).then(() => { key = ''; fill(); }); });
          }
          dropOn(tile, grp.raw, p.id);
          box.appendChild(tile);
        }
        folders.appendChild(box);
      }
      if (!folders.childElementCount) folders.appendChild(el('<p class="cv-brush-none">No brush matches.</p>'));
    };
    onLanguage(() => { key = ''; fill(); });   // the group names are set in place, in the new language
    // The tip as an editor, as the target's: drag the right handle to turn it, the top or bottom one to flatten it, or
    // anywhere else to turn it toward the pointer. It is the brush's own shape that changes.
    let grab: 'angle' | 'round' | null = null;
    const local = (ev: PointerEvent): [number, number, number] => { const r = tip.getBoundingClientRect(), dpr = tip.width / Math.max(1, r.width); return [(ev.clientX - r.left) * dpr, (ev.clientY - r.top) * dpr, dpr]; };
    tip.addEventListener('pointerdown', (ev) => {
      const [x, y, dpr] = local(ev), cx = tip.width / 2, cy = tip.height / 2, R = tip.width * 0.36;
      const a = (-e.brushShape.angle * Math.PI) / 180, ry = R * Math.max(0.05, e.brushShape.roundness / 100);
      const at = (px: number, py: number): [number, number] => [cx + px * Math.cos(a) - py * Math.sin(a), cy + px * Math.sin(a) + py * Math.cos(a)];
      const near = (p: [number, number]): boolean => Math.hypot(p[0] - x, p[1] - y) < 10 * dpr;
      grab = near(at(0, -ry)) || near(at(0, ry)) ? 'round' : 'angle';
      tip.setPointerCapture(ev.pointerId);
      move(ev);
    });
    const move = (ev: PointerEvent): void => {
      if (!grab) return;
      const [x, y] = local(ev), cx = tip.width / 2, cy = tip.height / 2, R = tip.width * 0.36;
      if (grab === 'angle') {
        let deg = Math.round((Math.atan2(-(y - cy), x - cx) * 180) / Math.PI);
        if (deg > 180) deg -= 360;
        e.brushShape = { ...e.brushShape, angle: deg };
      } else {
        const a = (-e.brushShape.angle * Math.PI) / 180, d = Math.abs(-(x - cx) * Math.sin(a) + (y - cy) * Math.cos(a));
        e.brushShape = { ...e.brushShape, roundness: Math.max(1, Math.min(100, Math.round((d / R) * 100))) };
      }
      e.emit('options', null);
    };
    tip.addEventListener('pointermove', move);
    const release = (): void => { grab = null; };
    tip.addEventListener('pointerup', release);
    tip.addEventListener('pointercancel', release);
    const picker = el<HTMLInputElement>('<input type="file" accept=".abr,image/*" hidden>');
    body.appendChild(picker);
    (body.querySelector('[data-act="load"]') as HTMLElement).addEventListener('click', () => picker.click());
    (body.querySelector('[data-act="new"]') as HTMLElement).addEventListener('click', () => {
      void (async () => {
        const name = (await promptName('New Brush Preset', `Brush ${importedBrushPresets.length + 1}`, 'Next'))?.trim();
        if (!name) return;
        const group = (await promptName('Folder', 'My Brushes', 'Save'))?.trim();
        if (!group) return;
        const r = await saveBrushPreset(e, name, group);
        e.notice(r.kept ? `Saved ${name} in ${group}.` : `Saved ${name} for this session only: it could not be stored.`);
        key = ''; fill();
      })();
    });
    picker.addEventListener('change', () => {
      const f = picker.files?.[0];
      picker.value = '';
      if (!f) return;
      void importAbr(e, f).then((r) => { e.notice(r.added ? `Loaded ${r.added} brush${r.added === 1 ? '' : 'es'} from ${f.name}.` : `${f.name} holds no brushes formvis can read.`); key = ''; fill(); }).catch((err) => e.notice(`Could not load ${f.name}: ${err instanceof Error ? err.message : String(err)}`, 'error'));
    });
    (body.querySelector('[data-act="settings"]') as HTMLElement).addEventListener('click', () => run('brush-settings'));
    const dab = (g: CanvasRenderingContext2D, x: number, y: number, r: number, hard: number): void => {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, inkA(1)); grad.addColorStop(Math.min(0.999, Math.max(0, hard)), inkA(1)); grad.addColorStop(1, inkA(0));
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    // Painted only when what it shows changed, and at most once a frame (1.86.5). Every engine 'options' event queued a
    // repaint of 121 radial-gradient dabs, and the Move and Transform tools send one per pointer move: WebKit (the
    // desktop app) keeps every queued fill and rasterised about 7,700 of them after a drag, a 3.5 s freeze at screen
    // scale 2, where Chrome and Firefox drop drawing a clear covers.
    let painted = '', paintQueued = 0;
    const paintSoon = (): void => { if (!paintQueued) paintQueued = requestAnimationFrame(() => { paintQueued = 0; paint(); }); };
    const paint = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const sig = [dpr, tip.clientWidth, tip.clientHeight, stroke.clientWidth, stroke.clientHeight, e.brush.hardness, e.brush.diameter, e.brushShape.angle, e.brushShape.roundness, ink().join(',')].join('|');
      if (sig === painted) return;
      painted = sig;
      for (const c of [tip, stroke]) { const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr); if (w && h && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; } }
      const hard = e.brush.hardness, tg = tip.getContext('2d') as CanvasRenderingContext2D;
      tg.clearRect(0, 0, tip.width, tip.height);
      if (tip.width) {
        const R = tip.width * 0.36, cx = tip.width / 2, cy = tip.height / 2;
        tg.strokeStyle = inkA(0.18); tg.lineWidth = dpr; tg.beginPath(); tg.moveTo(cx - R * 1.2, cy); tg.lineTo(cx + R * 1.2, cy); tg.moveTo(cx, cy - R * 1.2); tg.lineTo(cx, cy + R * 1.2); tg.stroke();
        // The tip as the target's shape editor: its outline at the tip's angle and roundness, a crosshair and three handles.
        const a = (-e.brushShape.angle * Math.PI) / 180, ry = R * Math.max(0.05, e.brushShape.roundness / 100);
        tg.strokeStyle = inkA(1); tg.lineWidth = 1.5 * dpr; tg.beginPath(); tg.ellipse(cx, cy, R, ry, a, 0, Math.PI * 2); tg.stroke();
        tg.fillStyle = inkA(1);
        for (const [px, py] of [[R, 0], [0, -ry], [0, ry]]) { const x = cx + px * Math.cos(a) - py * Math.sin(a), y = cy + px * Math.sin(a) + py * Math.cos(a); tg.beginPath(); tg.arc(x, y, 3.2 * dpr, 0, Math.PI * 2); tg.fill(); }
      }
      const sg = stroke.getContext('2d') as CanvasRenderingContext2D;
      sg.clearRect(0, 0, stroke.width, stroke.height);
      if (stroke.width) {
        const W = stroke.width, H = stroke.height, r = Math.max(2 * dpr, Math.min(H * 0.28, (e.brush.diameter / 2) * dpr));
        for (let i = 0; i <= 120; i++) { const t = i / 120; dab(sg, W * 0.12 + t * W * 0.76, H / 2 - Math.sin(t * Math.PI * 2) * H * 0.18, r, hard); }
      }
    };
    this.refreshers.push(() => { for (const s of setters) s(); fill(); paintSoon(); });
  }

  private paragraph(): void {
    const e = this.engine;
    const body = el(`<div class="cv-para cv-char"><div class="cv-seg" role="group" aria-label="Alignment">${(['left', 'center', 'right', 'justify'] as const).map((a) => `<button type="button" data-align="${a}" title="${a === 'justify' ? 'Justify' : `Align ${a}`}" aria-label="${a === 'justify' ? 'Justify' : `Align ${a}`}">${icon(a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : a === 'right' ? 'alignRight' : 'alignJustify', 16)}</button>`).join('')}</div></div>`);
    const btns = Array.from(body.querySelectorAll<HTMLButtonElement>('[data-align]'));
    for (const b of btns) b.addEventListener('click', () => setType(e, { align: b.dataset.align as TextSpec['align'] }));
    const row = (label: string, control: HTMLElement): void => { const r = el(`<label class="cv-char-row"><span>${label}</span></label>`); r.appendChild(control); body.appendChild(r); };
    const last = el<HTMLSelectElement>('<select class="cv-select" aria-label="Justify last line"><option value="left">Last line left</option><option value="center">Last line centre</option><option value="right">Last line right</option><option value="all">Justify all</option></select>');
    last.addEventListener('change', () => setType(e, { lastLine: last.value === 'left' ? undefined : last.value as TextSpec['lastLine'] }));
    const fields = ([['Left indent', 'indentLeft', 0], ['Right indent', 'indentRight', 0], ['First line', 'indentFirst', -2000], ['Space before', 'spaceBefore', 0], ['Space after', 'spaceAfter', 0]] as const).map(([label, key, min]) => {
      const f = numField('px', label, min, 5000, 1, (v) => setType(e, { [key]: v || undefined }));
      row(label, f.root);
      return { key, f };
    });
    const hyph = el<HTMLInputElement>('<input type="checkbox" aria-label="Hyphenate">');
    hyph.addEventListener('change', () => setType(e, { hyphenate: hyph.checked }));
    row('Justify', last); row('Hyphenate', hyph);
    new PanelGroup(this.root, 'paragraph', [{ id: 'paragraph', label: 'Paragraph', body }], 'Paragraph');
    this.refreshers.push(() => {
      const t = e.textSettings;
      for (const b of btns) { const on = b.dataset.align === t.align; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); }
      if (document.activeElement !== last) last.value = t.lastLine ?? 'left';
      for (const { key, f } of fields) f.set(t[key] ?? 0);
      hyph.checked = !!t.hyphenate;
    });
  }

  private character(): void {
    const e = this.engine;
    const body = el(`<div class="cv-char"></div>`);
    const row = (label: string, control: HTMLElement): void => { const r = el(`<label class="cv-char-row"><span>${label}</span></label>`); r.appendChild(control); body.appendChild(r); };
    const font = el<HTMLSelectElement>('<select class="cv-select" aria-label="Font"></select>');
    const style = el<HTMLSelectElement>('<select class="cv-select" aria-label="Style"><option value="00">Regular</option><option value="10">Bold</option><option value="01">Italic</option><option value="11">Bold Italic</option></select>');
    const kern = el<HTMLSelectElement>('<select class="cv-select" aria-label="Kerning"><option value="metrics">Metrics</option><option value="optical">Optical</option><option value="none">None</option></select>');
    font.addEventListener('change', () => setType(e, { family: font.value }));
    style.addEventListener('change', () => setType(e, { bold: style.value[0] === '1', italic: style.value[1] === '1' }));
    kern.addEventListener('change', () => setType(e, { kerning: kern.value as TextSpec['kerning'] }));
    const size = numField('pt', 'Size', 1, 1296, 1, (v) => setType(e, { size: v }));
    const leading = numField('pt', 'Leading', 1, 5000, 1, (v) => setType(e, { lineHeight: v / Math.max(1, e.textSettings.size) }));
    const tracking = numField('', 'Tracking', -1000, 10000, 10, (v) => setType(e, { tracking: Math.round(v) }));
    row('Font', font); row('Style', style); row('Size', size.root); row('Leading', leading.root); row('Tracking', tracking.root); row('Kerning', kern);
    const weight = el<HTMLSelectElement>(`<select class="cv-select" aria-label="Weight"><option value="">Auto</option>${[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => `<option value="${w}">${w}</option>`).join('')}</select>`);
    weight.addEventListener('change', () => setType(e, { weight: weight.value ? Number(weight.value) : undefined }));
    const caps = el<HTMLSelectElement>('<select class="cv-select" aria-label="Caps"><option value="">Normal</option><option value="all">All Caps</option><option value="small">Small Caps</option></select>');
    caps.addEventListener('change', () => setType(e, { caps: caps.value === 'all' || caps.value === 'small' ? caps.value : undefined }));
    const lines = el<HTMLSelectElement>('<select class="cv-select" aria-label="Lines"><option value="">None</option><option value="u">Underline</option><option value="s">Strikethrough</option><option value="us">Both</option></select>');
    lines.addEventListener('change', () => setType(e, { underline: lines.value.includes('u') || undefined, strike: lines.value.includes('s') || undefined }));
    const hscale = numField('%', 'Horizontal scale', 10, 500, 1, (v) => setType(e, { scaleX: v === 100 ? undefined : v }));
    const vscale = numField('%', 'Vertical scale', 10, 500, 1, (v) => setType(e, { scaleY: v === 100 ? undefined : v }));
    const shift = numField('px', 'Baseline shift', -2000, 2000, 1, (v) => setType(e, { baselineShift: v || undefined }));
    const feats = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="false" aria-label="OpenType features" placeholder="tnum, lnum, case, -kern">');
    feats.addEventListener('change', () => setType(e, { features: featuresFromText(feats.value) }));
    const axes = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="false" aria-label="Variable axes" placeholder="wght 600, wdth 90">');
    axes.addEventListener('change', () => { const v = variationsFromText(axes.value); setType(e, { variations: Object.keys(v).length ? v : null }); });
    const color = el<HTMLInputElement>('<input class="cv-input cv-color" type="color" aria-label="Colour">');
    color.addEventListener('input', () => {
      const m = /^#([0-9a-f]{6})$/i.exec(color.value), l = e.activeLayer;
      if (!m) return;
      e.fg = { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
      e.emit('options', null);
      if (l?.text && e.liveText(l)) void e.updateTextLayer(l.id, { ...l.text, color: e.fg });
    });
    row('Weight', weight); row('Colour', color); row('Caps', caps); row('Lines', lines); row('H scale', hscale.root); row('V scale', vscale.root); row('Baseline', shift.root); row('Features', feats); row('Axes', axes);
    new PanelGroup(this.root, 'character', [{ id: 'character', label: 'Character', body }], 'Character');
    let axesFace = '';
    let fonts = '';
    this.refreshers.push(() => {
      const t = e.textSettings, list = fontFamilies(), key = list.join('|');
      if (key !== fonts || !list.includes(t.family)) {
        fonts = key;
        font.textContent = '';
        for (const f of list.includes(t.family) ? list : [t.family, ...list]) { const o = document.createElement('option'); o.value = f; o.textContent = f; font.appendChild(o); }
      }
      for (const o of Array.from(font.options)) previewFont(o, o.value);   // Font Preview Size (36.31), a style compare when unchanged
      if (document.activeElement !== font) font.value = t.family;
      if (document.activeElement !== style) style.value = `${t.bold ? 1 : 0}${t.italic ? 1 : 0}`;
      if (document.activeElement !== kern) kern.value = t.kerning;
      size.set(t.size); leading.set(Math.round(t.size * t.lineHeight * 10) / 10); tracking.set(t.tracking);
      if (document.activeElement !== weight) weight.value = t.weight ? String(t.weight) : '';
      if (document.activeElement !== caps) caps.value = t.caps ?? '';
      if (document.activeElement !== lines) lines.value = `${t.underline ? 'u' : ''}${t.strike ? 's' : ''}`;
      hscale.set(t.scaleX ?? 100); vscale.set(t.scaleY ?? 100); shift.set(t.baselineShift ?? 0);
      if (document.activeElement !== feats) feats.value = featuresToText(t.features);
      if (document.activeElement !== axes) axes.value = variationsToText(t.variations);
      if (document.activeElement !== color) color.value = `#${[e.fg.r, e.fg.g, e.fg.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      const face = `${t.family}|${t.bold}|${t.italic}`;
      if (face !== axesFace) {
        axesFace = face;
        void axesOf(t.family, t.bold, t.italic).then((found) => { if (axesFace === face) axes.placeholder = found?.length ? found.map((a) => `${a.tag} ${a.min}-${a.max}`).join(', ') : 'No variable axes in this font'; });
      }
    });
  }
}
