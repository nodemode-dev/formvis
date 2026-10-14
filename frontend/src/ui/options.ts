import type { Engine, ToolId } from '../engine';
import { toolList, type OptionSpec, type Tool } from '../extensions/registry';
import { el, q, setChecked, setClass, setHidden, setText, setValue } from './dom';
import { icon } from './icons';
import { onLanguage, t as tr } from './i18n';
import { previewFont } from './fonts';

/** An options-bar label in the current language, its English kept in data-en for language changes (35.5d). */
const labelEn = (s: HTMLElement, en: string): void => { s.dataset.en = en; setText(s, tr(en)); };

/** One tool's built row of controls, and the functions that bring those controls up to date. */
interface Group { node: HTMLElement; sync: Array<() => void> }

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
    new ResizeObserver(() => this.syncEdges()).observe(root);
    engine.on('tool', () => this.show());
    // Labels follow the interface language in place (35.5d): each keeps its English in data-en.
    onLanguage(() => { for (const s of Array.from(root.querySelectorAll<HTMLElement>('[data-en]'))) setText(s, tr(s.dataset.en ?? '')); });
    for (const ev of ['options', 'active', 'colors', 'doc'] as const) engine.on(ev, () => this.queue());
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
      const when = spec.when;
      if (when) {
        const added = Array.from(node.children).slice(before) as HTMLElement[];
        sync.push(() => { const on = when(); for (const a of added) setHidden(a, !on); });
      }
    }
    return { node, sync };
  }

  /** Shows the active tool's row and hides every other. */
  private show(): void {
    for (const [id, g] of this.groups) setHidden(g.node, id !== this.engine.tool);
    this.root.scrollLeft = 0;
    this.refresh();
    this.syncEdges();
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
