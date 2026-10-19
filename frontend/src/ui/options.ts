import type { Engine, ToolId } from '../engine';
import { toolList, type OptionSpec, type Tool } from '../extensions/registry';
import { el, q, setChecked, setClass, setHidden, setText, setValue } from './dom';
import { icon } from './icons';
import { onLanguage, t as tr } from './i18n';
import { previewFont } from './fonts';

/** An options-bar label in the current language, its English kept in data-en for language changes (35.5d). */
const labelEn = (s: HTMLElement, en: string): void => { s.dataset.en = en; setText(s, tr(en)); };

/** A choice list that previews: it opens over a select in place of the native menu, and hovering or arrowing to a choice
 *  calls `spec.preview(id)` (the Type tool shows that face on the layer); Escape, leaving the list or a click outside
 *  calls `preview(null)`, which puts the layer back. The list is built once; its rows are patched as the choices change. */
function facePicker(box: HTMLSelectElement, spec: Extract<OptionSpec, { kind: 'select' }>): void {
  const pop = el<HTMLDivElement>('<div class="cv-face-list" role="listbox" hidden></div>');
  let open = false, at = -1;
  const rows = (): HTMLElement[] => Array.from(pop.children) as HTMLElement[];
  const mark = (i: number): void => { at = i; rows().forEach((r, k) => setClass(r, 'is-on', k === i)); const r = rows()[i]; if (r) { r.scrollIntoView({ block: 'nearest' }); spec.preview?.(r.dataset.id ?? null); } };
  const close = (keep: boolean): void => {
    if (!open) return;
    open = false; setHidden(pop, true); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', keys, true);
    if (!keep) spec.preview?.(null);
  };
  const pick = (id: string): void => { spec.preview?.(null); close(true); if (box.value !== id) box.value = id; spec.set(id); };
  const away = (e: Event): void => { if (!pop.contains(e.target as Node) && e.target !== box) close(false); };
  const keys = (e: KeyboardEvent): void => {
    const n = rows().length;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); mark(Math.min(n - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const r = rows()[at]; if (r) pick(r.dataset.id ?? ''); else close(false); }
  };
  pop.addEventListener('mouseover', (e) => { const r = (e.target as HTMLElement).closest<HTMLElement>('.cv-face-row'); if (r) { at = rows().indexOf(r); rows().forEach((x) => setClass(x, 'is-on', x === r)); spec.preview?.(r.dataset.id ?? null); } });
  pop.addEventListener('mouseleave', () => { rows().forEach((x) => setClass(x, 'is-on', false)); spec.preview?.(null); });
  pop.addEventListener('click', (e) => { const r = (e.target as HTMLElement).closest<HTMLElement>('.cv-face-row'); if (r) pick(r.dataset.id ?? ''); });
  box.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (open) { close(false); return; }
    const list = (spec.live ? spec.live() : spec.choices).filter((c) => c.id);
    while (pop.children.length > list.length) pop.lastElementChild?.remove();
    list.forEach((c, i) => {
      const r = (pop.children[i] as HTMLElement | undefined) ?? pop.appendChild(el('<div class="cv-face-row" role="option"></div>'));
      if (r.dataset.id !== c.id) r.dataset.id = c.id;
      const label = c.label.replace(/^\[[ x]\] /, '');
      if (r.textContent !== label) r.textContent = label;
      const own = spec.label === 'Font' && c.id === c.label ? `"${c.id.replace(/"/g, '')}", sans-serif` : '';
      if (r.style.fontFamily !== own) r.style.fontFamily = own;
    });
    const b = box.getBoundingClientRect();
    pop.style.left = `${b.left}px`; pop.style.top = `${b.bottom + 2}px`; pop.style.minWidth = `${b.width}px`;
    if (!pop.parentElement) (document.getElementById('overlay-root') ?? document.body).appendChild(pop);
    at = list.findIndex((c) => c.id === box.value);
    rows().forEach((r, k) => setClass(r, 'is-on', k === at));
    setHidden(pop, false);
    open = true;
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', keys, true);
    rows()[at]?.scrollIntoView({ block: 'nearest' });
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') e.preventDefault(); });
}

/** One tool's built row of controls, and the functions that bring those controls up to date; `parked` holds the
 *  trailing controls moved into the More panel while the row is wider than the bar (1.87.2), in row order. */
interface Group { node: HTMLElement; sync: Array<() => void>; parked: HTMLElement[] }

/** The options bar: one row per tool, all built once, only the active tool's row visible. */
export class OptionsBar {
  private readonly groups = new Map<ToolId, Group>();
  private frame = 0;

  constructor(private readonly root: HTMLElement, private readonly engine: Engine) {
    for (const t of toolList()) {
      const g = this.build(t);
      this.groups.set(t.id, g);
      root.appendChild(g.node);
    }
    // A bar wider than the window: a vertical wheel scrolls it sideways, and a chevron shows at each end with
    // settings past it (laid over the bar, so showing one moves nothing).
    const edge = (side: 'start' | 'end'): HTMLButtonElement => {
      const b = el<HTMLButtonElement>(`<button class="cv-options-edge is-${side}" type="button" tabindex="-1" aria-label="${side === 'start' ? 'Earlier settings' : 'More settings'}" hidden>${icon(side === 'start' ? 'chevronLeft' : 'chevronRight', 14)}</button>`);
      b.addEventListener('click', () => root.scrollBy({ left: (side === 'start' ? -1 : 1) * root.clientWidth * 0.7, behavior: 'smooth' }));
      root.parentElement?.appendChild(b);
      return b;
    };
    this.edges = [edge('start'), edge('end')];
    root.addEventListener('wheel', (e) => {
      if (root.scrollWidth <= root.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      root.scrollLeft += e.deltaY;
    }, { passive: false });
    root.addEventListener('scroll', () => this.syncEdges(), { passive: true });
    // The bar never scrolls in normal use (1.87.2, CLOSE_GAPS P03): controls that do not fit move, as built, into the
    // More panel at the bar's end, last first, and come back when there is room. The chevrons stay as a fallback.
    root.appendChild(this.more);
    document.body.appendChild(this.pop);
    this.more.addEventListener('click', () => this.togglePop(this.pop.hidden === true));
    // The panel sits at the end of the page, so Tab from the open button goes into it, not through the whole window first.
    this.more.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.shiftKey || this.pop.hidden) return;
      const first = Array.from(this.pop.querySelectorAll<HTMLElement>('input, select, button')).find((n) => n.offsetParent !== null);
      if (first) { e.preventDefault(); first.focus(); }
    });
    document.addEventListener('pointerdown', (e) => { if (!this.pop.hidden && !this.pop.contains(e.target as Node) && !this.more.contains(e.target as Node)) this.togglePop(false); }, true);
    this.pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.togglePop(false); this.more.focus(); } });
    let width = 0;
    new ResizeObserver(() => { const w = root.clientWidth; if (w !== width) { width = w; this.fit(); } this.syncEdges(); }).observe(root);
    engine.on('tool', () => this.show());
    // Labels follow the interface language in place (35.5d): each keeps its English in data-en.
    onLanguage(() => { for (const s of Array.from(root.querySelectorAll<HTMLElement>('[data-en]'))) setText(s, tr(s.dataset.en ?? '')); });
    for (const ev of ['options', 'active', 'colors', 'doc', 'selection'] as const) engine.on(ev, () => this.queue());
    this.show();
  }

  /** Coalesces refresh requests into at most one per animation frame. */
  private queue(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.refresh(); });
  }

  /** Builds the hidden row for one tool; each control is created once and refreshed in place by its sync function. */
  private build(t: Tool): Group {
    const node = el('<div class="cv-opt-group" hidden></div>');
    const sync: Array<() => void> = [];
    const specs: OptionSpec[] = t.options?.(this.engine) ?? [{ kind: 'title', text: t.label } as OptionSpec];
    for (const spec of specs) {
      const before = node.children.length;
      if (spec.kind === 'title') {
        // The tool's own icon in a raised chip, as the target's bar begins (Phase 21); its name as the label and tooltip.
        const n = el('<span class="cv-opt-title cv-opt-tool" role="img"></span>');
        n.setAttribute('aria-label', tr(spec.text));
        n.title = tr(spec.text);
        let shown = '';
        const paint = (): void => { const name = t.icon(this.engine); if (name !== shown) { shown = name; n.innerHTML = icon(name, 18); } };
        paint();
        sync.push(paint);
        node.appendChild(n);
      } else if (spec.kind === 'segment') {
        const n = el('<div class="cv-opt"><span class="cv-opt-label"></span><div class="cv-seg" role="group"></div></div>');
        labelEn(q(n, '.cv-opt-label'), spec.label ?? '');
        const seg = q(n, '.cv-seg');
        const btns: Array<[string, HTMLButtonElement]> = spec.choices.map((c) => {
          const b = el<HTMLButtonElement>('<button type="button"></button>');
          setText(b, c.label);
          b.addEventListener('click', () => spec.set(c.id));
          seg.appendChild(b);
          return [c.id, b];
        });
        sync.push(() => { const v = spec.get(); for (const [id, b] of btns) setClass(b, 'is-active', id === v); });
        node.appendChild(n);
      } else if (spec.kind === 'range') {
        const n = el('<label class="cv-opt"><span></span><input type="range"><input class="cv-num" type="number"><span class="cv-opt-unit"></span></label>');
        labelEn(q(n, 'span'), spec.label);
        const rng = q<HTMLInputElement>(n, 'input[type="range"]'), num = q<HTMLInputElement>(n, 'input.cv-num');
        for (const inp of [rng, num]) { inp.min = String(spec.min); inp.max = String(spec.max); inp.step = String(spec.step ?? 1); }
        setText(q(n, '.cv-opt-unit'), spec.unit ?? '');
        rng.addEventListener('input', () => spec.set(Number(rng.value)));
        num.addEventListener('change', () => {
          const v = Number(num.value);
          if (Number.isFinite(v)) spec.set(Math.min(spec.max, Math.max(spec.min, v)));
          num.blur();
        });
        num.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') num.blur(); });
        sync.push(() => { const v = String(Math.round(spec.get() * 100) / 100); setValue(rng, v); setValue(num, v); });
        node.appendChild(n);
      } else if (spec.kind === 'select') {
        const n = el('<label class="cv-opt"><span></span><select class="cv-opt-select"></select></label>');
        labelEn(q(n, 'span'), spec.label);
        const box = q<HTMLSelectElement>(n, 'select');
        for (const c of spec.choices) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.label; box.appendChild(o); }
        box.addEventListener('change', () => spec.set(box.value));
        box.addEventListener('keydown', (e) => e.stopPropagation());
        if (spec.preview) facePicker(box, spec);
        sync.push(() => {
          // A live list (presets added while the tool is active) is patched in place: same values keep their nodes.
          const list = spec.live?.();
          if (list) {
            while (box.options.length > list.length) box.remove(box.options.length - 1);
            list.forEach((c, i) => { const o = box.options[i] ?? box.appendChild(document.createElement('option')); if (o.value !== c.id) o.value = c.id; if (o.textContent !== c.label) o.textContent = c.label; });
            if (spec.label === 'Font') for (const o of Array.from(box.options)) if (o.value && o.value === o.textContent) previewFont(o, o.value);   // Font Preview Size (36.31)
          }
          const v = spec.get();
          if (box.value !== v) box.value = v;
        });
        node.appendChild(n);
      } else if (spec.kind === 'toggle') {
        const n = el('<label class="cv-opt"><input type="checkbox"><span></span></label>');
        labelEn(q(n, 'span'), spec.label);
        const box = q<HTMLInputElement>(n, 'input');
        box.addEventListener('change', () => spec.set(box.checked));
        sync.push(() => setChecked(box, spec.get()));
        node.appendChild(n);
      } else if (spec.kind === 'color') {
        const n = el('<label class="cv-opt cv-opt-color"><span></span><input type="color"></label>');
        labelEn(q(n, 'span'), spec.label);
        const inp = q<HTMLInputElement>(n, 'input'), hex = (c: { r: number; g: number; b: number }): string => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
        inp.setAttribute('aria-label', spec.label);
        inp.addEventListener('input', () => { const v = inp.value; spec.set({ r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) }); });
        sync.push(() => { const want = hex(spec.get()); if (inp.value !== want) inp.value = want; });
        node.appendChild(n);
      } else if (spec.kind === 'number') {
        const n = el('<label class="cv-opt"><span></span><input class="cv-num" type="number"><span class="cv-opt-unit"></span></label>');
        labelEn(q(n, 'span'), spec.label);
        const inp = q<HTMLInputElement>(n, 'input');
        inp.step = String(spec.step ?? 1);
        if (spec.min !== undefined) inp.min = String(spec.min);
        if (spec.max !== undefined) inp.max = String(spec.max);
        setText(q(n, '.cv-opt-unit'), spec.unit ?? '');
        let committed = inp.value;
        const commit = (): void => {
          const text = inp.value;
          if (text === committed) return;
          committed = text;
          if (text !== '' && Number.isFinite(Number(text))) spec.set(Number(text));
        };
        inp.addEventListener('change', commit);
        inp.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { commit(); inp.blur(); }
          else if (e.key === 'Escape') { inp.value = committed; inp.blur(); }
        });
        sync.push(() => {
          if (document.activeElement === inp) return;
          const v = spec.get();
          const text = v === null ? '' : String(Math.round(v * 100) / 100);
          setValue(inp, text);
          committed = text;
        });
        node.appendChild(n);
      } else if (spec.kind === 'readout') {
        const n = el('<span class="cv-opt"><span></span><span class="cv-readout"></span></span>');
        labelEn(q(n, 'span'), spec.label);
        const out = q(n, '.cv-readout');
        sync.push(() => setText(out, spec.get()));
        node.appendChild(n);
      } else if (spec.compact && spec.icon) {
        // Icon only, as the target's align buttons; a thin divider begins each run of them.
        const prev = node.lastElementChild;
        if (!prev?.classList.contains('cv-opt-icon')) node.appendChild(el('<span class="cv-opt-sep" aria-hidden="true"></span>'));
        const n = el<HTMLButtonElement>(`<button class="cv-opt-icon" type="button">${icon(spec.icon, 18)}</button>`);
        n.title = spec.label;
        n.setAttribute('aria-label', spec.label);
        n.addEventListener('click', () => spec.run());
        node.appendChild(n);
      } else {
        const n = el<HTMLButtonElement>(`<button class="cv-btn cv-btn-ghost" type="button">${spec.icon ? icon(spec.icon, 14) : ''}<span class="cv-btn-label"></span></button>`);
        labelEn(q(n, '.cv-btn-label'), spec.label);
        n.addEventListener('click', () => spec.run());
        node.appendChild(n);
      }
      // A row that applies only sometimes (a shape kind's own settings) is built once like every row and shown or
      // hidden in place, so the bar is never rebuilt.
      const added = Array.from(node.children).slice(before) as HTMLElement[];
      const when = spec.when;
      if (when) sync.push(() => { const on = when(); for (const a of added) setHidden(a, !on); });
      // How long each node stays in a crowded bar (fit): the spec's own priority, else by kind; a divider goes before its buttons.
      const rank = spec.priority ?? (spec.kind === 'button' ? (spec.compact && spec.icon ? 15 : 20) : spec.kind === 'toggle' || spec.kind === 'readout' ? 30 : 50);
      for (const a of added) a.dataset.pri = String(a.classList.contains('cv-opt-sep') ? rank - 0.5 : rank);
    }
    Array.from(node.children).forEach((c, i) => { (c as HTMLElement).dataset.ord = String(i); });
    return { node, sync, parked: [] };
  }

  /** Shows the active tool's row and hides every other. */
  private show(): void {
    this.togglePop(false);
    for (const [id, g] of this.groups) setHidden(g.node, id !== this.engine.tool);
    this.root.scrollLeft = 0;
    this.refresh();
    this.fit();
    this.syncEdges();
  }

  private readonly more = el<HTMLButtonElement>(`<button class="cv-opt-more" type="button" aria-haspopup="true" aria-expanded="false" title="More options" aria-label="More options" hidden>${icon('more3', 16)}</button>`);
  private readonly pop = el('<div class="cv-opt-pop" role="group" aria-label="More options" hidden></div>');

  /** Parked controls back in the row at their built places. */
  private unpark(g: Group): void {
    for (const n of g.parked) {
      const ord = Number(n.dataset.ord), next = Array.from(g.node.children).find((c) => Number((c as HTMLElement).dataset.ord) > ord) ?? null;
      g.node.insertBefore(n, next);
    }
    g.parked = [];
  }

  /** The active row fitted to the bar: parked controls come back, then controls move into the More panel until the
   *  row fits beside the More button: lowest priority first (a spec's `priority`, else by kind), the later one first on
   *  a tie, so sizes, modes and sliders stay in the bar longest and what stays keeps its order. Nodes move as built
   *  (listeners and sync functions stay); a measure per move, only on a tool change or a width change. */
  private fit(): void {
    const g = this.groups.get(this.engine.tool);
    for (const other of this.groups.values()) if (other !== g && other.parked.length) this.unpark(other);
    if (!g) return;
    if (g.parked.length) this.unpark(g);
    const r = this.root, over = (): boolean => r.scrollWidth > r.clientWidth + 1;
    if (!over()) { setHidden(this.more, true); this.togglePop(false); return; }
    setHidden(this.more, false);
    const rank = (n: HTMLElement): number => Number(n.dataset.pri ?? 50), ord = (n: HTMLElement): number => Number(n.dataset.ord);
    const order = (Array.from(g.node.children) as HTMLElement[]).filter((n) => !n.hidden && !n.classList.contains('cv-opt-tool')).sort((a, b) => rank(a) - rank(b) || ord(b) - ord(a));
    for (const n of order) {
      if (!over()) break;
      n.remove();
      g.parked.push(n);
    }
    g.parked.sort((a, b) => ord(a) - ord(b));
    this.pop.append(...g.parked);
    if (!g.parked.length) setHidden(this.more, true);
  }

  private togglePop(open: boolean): void {
    if (open && !this.groups.get(this.engine.tool)?.parked.length) open = false;
    if (open) {
      const b = this.more.getBoundingClientRect();
      const right = `${Math.max(8, Math.round(window.innerWidth - b.right))}px`, top = `${Math.round(b.bottom + 4)}px`;
      if (this.pop.style.right !== right) this.pop.style.right = right;
      if (this.pop.style.top !== top) this.pop.style.top = top;
    }
    setHidden(this.pop, !open);
    setClass(this.more, 'is-active', open);
    if (this.more.getAttribute('aria-expanded') !== String(open)) this.more.setAttribute('aria-expanded', String(open));
  }

  private readonly edges: HTMLButtonElement[];

  /** Each end's chevron shown only while settings lie past that end, placed over the bar's own edge. */
  private syncEdges(): void {
    const r = this.root, max = r.scrollWidth - r.clientWidth, box = r.getBoundingClientRect();
    const [start, end] = this.edges;
    setHidden(start, !(max > 1 && r.scrollLeft > 1));
    setHidden(end, !(max > 1 && r.scrollLeft < max - 1));
    for (const b of this.edges) {
      if (b.hidden) continue;
      const top = `${Math.round(box.top)}px`, h = `${Math.round(box.height)}px`, x = b === start ? `${Math.round(box.left)}px` : `${Math.round(box.right - b.offsetWidth)}px`;
      if (b.style.top !== top) b.style.top = top;
      if (b.style.height !== h) b.style.height = h;
      if (b.style.left !== x) b.style.left = x;
    }
  }

  /** Brings every control of the active tool's row up to date. */
  private refresh(): void {
    const g = this.groups.get(this.engine.tool);
    if (g) for (const fn of g.sync) fn();
  }
}
