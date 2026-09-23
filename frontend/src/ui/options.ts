import type { Engine, ToolId } from '../engine';
import { toolList, type OptionSpec, type Tool } from '../extensions/registry';
import { el, q, setChecked, setClass, setHidden, setText, setValue } from './dom';
import { icon } from './icons';

interface Group { node: HTMLElement; sync: Array<() => void> }

export class OptionsBar {
  private readonly groups = new Map<ToolId, Group>();
  private frame = 0;

  constructor(private readonly root: HTMLElement, private readonly engine: Engine) {
    for (const t of toolList()) {
      const g = this.build(t);
      this.groups.set(t.id, g);
      root.appendChild(g.node);
    }
    engine.on('tool', () => this.show());
    for (const k of ['options', 'active', 'colors', 'doc'] as const) engine.on(k, () => this.queue());
    this.show();
  }

  private queue(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.refresh(); });
  }

  private build(t: Tool): Group {
    const node = el('<div class="cv-opt-group" hidden></div>');
    const sync: Array<() => void> = [];
    for (const spec of t.options?.(this.engine) ?? [{ kind: 'title', text: t.label } as OptionSpec]) {
      if (spec.kind === 'title') {
        const n = el('<span class="cv-opt-title"></span>');
        setText(n, spec.text);
        node.appendChild(n);
      } else if (spec.kind === 'segment') {
        const n = el('<div class="cv-opt"><span class="cv-opt-label"></span><div class="cv-seg" role="group"></div></div>');
        setText(q(n, '.cv-opt-label'), spec.label ?? '');
        const seg = q(n, '.cv-seg');
        const buttons = spec.choices.map((c) => {
          const b = el<HTMLButtonElement>('<button type="button"></button>');
          setText(b, c.label);
          b.addEventListener('click', () => spec.set(c.id));
          seg.appendChild(b);
          return { id: c.id, b };
        });
        sync.push(() => { const v = spec.get(); for (const x of buttons) setClass(x.b, 'is-active', x.id === v); });
        node.appendChild(n);
      } else if (spec.kind === 'range') {
        const n = el(`<label class="cv-opt"><span></span><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step ?? 1}"><input class="cv-num" type="number" min="${spec.min}" max="${spec.max}" step="${spec.step ?? 1}"><span class="cv-opt-unit"></span></label>`);
        setText(q(n, 'span'), spec.label);
        setText(q(n, '.cv-opt-unit'), spec.unit ?? '');
        const range = q<HTMLInputElement>(n, 'input[type="range"]');
        const num = q<HTMLInputElement>(n, 'input[type="number"]');
        range.addEventListener('input', () => spec.set(Number(range.value)));
        num.addEventListener('change', () => { const v = Number(num.value); if (Number.isFinite(v)) spec.set(Math.min(spec.max, Math.max(spec.min, v))); num.blur(); });
        num.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') num.blur(); });
        sync.push(() => { const v = String(Math.round(spec.get() * 100) / 100); setValue(range, v); setValue(num, v); });
        node.appendChild(n);
      } else if (spec.kind === 'select') {
        const n = el('<label class="cv-opt"><span></span><select class="cv-opt-select"></select></label>');
        setText(q(n, 'span'), spec.label);
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
          }
          const v = spec.get();
          if (box.value !== v) box.value = v;
        });
        node.appendChild(n);
      } else if (spec.kind === 'toggle') {
        const n = el('<label class="cv-opt"><input type="checkbox"><span></span></label>');
        setText(q(n, 'span'), spec.label);
        const box = q<HTMLInputElement>(n, 'input');
        box.addEventListener('change', () => spec.set(box.checked));
        sync.push(() => setChecked(box, spec.get()));
        node.appendChild(n);
      } else if (spec.kind === 'number') {
        const n = el(`<label class="cv-opt"><span></span><input class="cv-num" type="number" step="${spec.step ?? 1}"${spec.min !== undefined ? ` min="${spec.min}"` : ''}${spec.max !== undefined ? ` max="${spec.max}"` : ''}><span class="cv-opt-unit"></span></label>`);
        setText(q(n, 'span'), spec.label);
        setText(q(n, '.cv-opt-unit'), spec.unit ?? '');
        const box = q<HTMLInputElement>(n, 'input');
        let committed = '';
        const commit = (): void => {
          if (box.value === committed) return;
          committed = box.value;
          const v = Number(box.value);
          if (box.value !== '' && Number.isFinite(v)) spec.set(v);
        };
        box.addEventListener('change', commit);
        box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { commit(); box.blur(); } else if (e.key === 'Escape') { box.value = committed; box.blur(); } });
        sync.push(() => {
          const v = spec.get(), text = v === null ? '' : String(Math.round(v * 100) / 100);
          if (document.activeElement === box) return;
          if (box.value !== text) box.value = text;
          committed = text;
        });
        node.appendChild(n);
      } else if (spec.kind === 'readout') {
        const n = el('<span class="cv-opt"><span></span><span class="cv-readout"></span></span>');
        setText(q(n, 'span'), spec.label);
        const out = q(n, '.cv-readout');
        sync.push(() => setText(out, spec.get()));
        node.appendChild(n);
      } else {
        const n = el<HTMLButtonElement>(`<button class="cv-btn cv-btn-ghost" type="button">${spec.icon ? icon(spec.icon, 14) : ''}<span class="cv-btn-label"></span></button>`);
        setText(q(n, '.cv-btn-label'), spec.label);
        n.addEventListener('click', () => spec.run());
        node.appendChild(n);
      }
    }
    return { node, sync };
  }

  private show(): void {
    for (const [id, g] of this.groups) setHidden(g.node, id !== this.engine.tool);
    this.refresh();
  }

  private refresh(): void {
    const g = this.groups.get(this.engine.tool);
    if (g) for (const fn of g.sync) fn();
  }
}
