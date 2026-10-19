import { clamp } from '../../engine';
import { curveValue } from '../../engine/filters-lib/distort';
import { el, q, setChecked, setText, setValue } from '../dom';
import { enhanceSelect } from '../dropdown';

export interface Row<T> { el: HTMLElement; set(v: T): void }

export const fmt = (v: number): string => String(Number(v.toFixed(3)));

export function sliderRow(label: string, min: number, max: number, step: number, onInput: (v: number) => void, limits: { min?: number; max?: number; def?: number } = {}): Row<number> {
  const lo = limits.min ?? min, hi = limits.max ?? max;
  const root = el(`<div class="cv-field cv-slider"><span></span><div class="cv-slider-ctl"><input type="range" min="${min}" max="${max}" step="${step}"><input class="cv-num" type="number" min="${lo}" max="${hi}" step="${step}"></div></div>`);
  setText(q(root, 'span'), label);
  const range = q(root, 'input[type="range"]') as HTMLInputElement;
  const box = q(root, 'input.cv-num') as HTMLInputElement;
  range.setAttribute('aria-label', label); box.setAttribute('aria-label', `${label} value`);   // named for assistive technology (1.53.4)
  range.addEventListener('input', () => {
    const v = range.valueAsNumber;
    box.value = fmt(v);
    onInput(v);
  });
  box.addEventListener('change', () => {
    const raw = box.valueAsNumber;
    if (!Number.isFinite(raw)) return;
    const v = clamp(raw, lo, hi);
    box.value = fmt(v);
    range.value = String(v);
    onInput(v);
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); box.blur(); } });
  if (limits.def !== undefined) {
    const def = limits.def;
    q(root, 'span').addEventListener('dblclick', () => { range.value = String(def); box.value = fmt(def); onInput(def); });
    q(root, 'span').title = 'Double-click to reset';
  }
  return { el: root, set(v) { range.value = String(v); setValue(box, fmt(v)); } };
}

/** With `onHover`, the choices show as the hover-preview menu: the value under the pointer or arrow keys, null when it closes. */
export function selectRow(label: string, options: ReadonlyArray<readonly [string, string]>, onChange: (v: string) => void, onHover?: (v: string | null) => void): Row<string> {
  const root = el(`<label class="cv-field"><span></span><select class="cv-input">${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`);
  setText(q(root, 'span'), label);
  const sel = q(root, 'select') as HTMLSelectElement;
  sel.addEventListener('change', () => onChange(sel.value));
  if (onHover) enhanceSelect(sel, { onHover });
  return { el: root, set(v) { if (sel.value !== v) sel.value = v; } };
}

export function checkRow(label: string, onChange: (v: boolean) => void): Row<boolean> {
  const root = el('<label class="cv-field cv-check"><span></span><input type="checkbox"></label>');
  setText(q(root, 'span'), label);
  const box = q(root, 'input') as HTMLInputElement;
  box.addEventListener('change', () => onChange(box.checked));
  return { el: root, set(v) { setChecked(box, v); } };
}

export function colorRow(label: string, onChange: (hex: string) => void): Row<string> {
  const root = el('<label class="cv-field"><span></span><input class="cv-input cv-color" type="color"></label>');
  setText(q(root, 'span'), label);
  const inp = q(root, 'input') as HTMLInputElement;
  inp.addEventListener('input', () => onChange(inp.value));
  return { el: root, set(v) { setValue(inp, v); } };
}

export function matrixRow(label: string, size: number, min: number, max: number, onInput: (v: number[]) => void): Row<number[]> {
  const node = el('<div class="cv-field"><span></span><div class="cv-matrix"></div></div>');
  setText(q(node, 'span'), label);
  const grid = q(node, '.cv-matrix');
  const cells = Array.from({ length: size * size }, (_, i) => {
    const input = el<HTMLInputElement>(`<input class="cv-input" type="number" min="${min}" max="${max}" step="1">`);
    input.setAttribute('aria-label', `${label} row ${Math.floor(i / size) + 1} column ${(i % size) + 1}`);
    grid.appendChild(input);
    return input;
  });
  const read = (): number[] => cells.map((c) => { const v = Math.round(Number(c.value)); return Number.isFinite(v) ? clamp(v, min, max) : 0; });
  for (const c of cells) c.addEventListener('input', () => onInput(read()));
  return { el: node, set: (v) => { cells.forEach((c, i) => setValue(c, String(v[i] ?? 0))); } };
}

/** A curve box for flat pairs of position (0 to 1, down the box) and value (min to max, across it). Drag a point, click the
 *  box to add one, double-click or Delete to remove one; the end points keep their positions. The nodes are built once. */
export function curveRow(label: string, min: number, max: number, onInput: (v: number[]) => void): Row<number[]> {
  const NS = 'http://www.w3.org/2000/svg', W = 200, H = 150;
  const root = el('<div class="cv-field"><span></span><svg class="cv-shape-curve" viewBox="0 0 200 150" role="group"></svg></div>'), svg = q(root, 'svg') as unknown as SVGSVGElement;
  setText(q(root, 'span'), label);
  svg.setAttribute('aria-label', label);
  const make = <K extends keyof SVGElementTagNameMap>(tag: K, cls: string): SVGElementTagNameMap[K] => { const n = document.createElementNS(NS, tag); n.setAttribute('class', cls); svg.appendChild(n); return n; };
  const axis = make('line', 'cv-shape-axis'), line = make('path', 'cv-shape-line');
  axis.setAttribute('x1', String(W / 2)); axis.setAttribute('x2', String(W / 2)); axis.setAttribute('y1', '0'); axis.setAttribute('y2', String(H));
  let pts: number[][] = [[0, 0], [1, 0]];
  const dots: SVGCircleElement[] = [];
  const X = (v: number): number => ((v - min) / (max - min)) * W, Y = (t: number): number => t * H;
  const flat = (): number[] => pts.flatMap((p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 10) / 10]);
  const paint = (): void => {
    while (dots.length < pts.length) { const d = make('circle', 'cv-shape-dot'); d.setAttribute('r', '5'); d.setAttribute('tabindex', '0'); dots.push(d); }
    while (dots.length > pts.length) dots.pop()?.remove();
    pts.forEach((p, i) => { dots[i].setAttribute('cx', X(p[1]).toFixed(1)); dots[i].setAttribute('cy', Y(p[0]).toFixed(1)); dots[i].setAttribute('aria-label', `${label} point ${i + 1}`); });
    const flatPts = flat();
    let d = '';
    for (let i = 0; i <= 60; i++) { const t = i / 60; d += `${i ? 'L' : 'M'}${X(curveValue(flatPts, t)).toFixed(1)} ${Y(t).toFixed(1)}`; }
    line.setAttribute('d', d);
  };
  const at = (e: PointerEvent): [number, number] => {
    const r = svg.getBoundingClientRect();
    return [clamp((e.clientY - r.top) / Math.max(1, r.height), 0, 1), clamp(min + ((e.clientX - r.left) / Math.max(1, r.width)) * (max - min), min, max)];
  };
  let drag = -1;
  svg.addEventListener('pointerdown', (e) => {
    const hit = dots.indexOf(e.target as SVGCircleElement), [t, v] = at(e);
    if (hit < 0) {
      if (pts.length >= 16) return;
      let k = pts.findIndex((p) => p[0] > t);
      if (k < 1) k = pts.length - 1;
      pts.splice(k, 0, [t, v]);
      drag = k;
      paint();
      onInput(flat());
    } else drag = hit;
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const [t, v] = at(e), last = pts.length - 1;
    pts[drag] = [drag === 0 ? 0 : drag === last ? 1 : clamp(t, pts[drag - 1][0] + 0.01, pts[drag + 1][0] - 0.01), v];
    paint();
    onInput(flat());
  });
  const drop = (): void => { drag = -1; };
  svg.addEventListener('pointerup', drop);
  svg.addEventListener('pointercancel', drop);
  const remove = (i: number): void => { if (i > 0 && i < pts.length - 1) { pts.splice(i, 1); paint(); onInput(flat()); } };
  svg.addEventListener('dblclick', (e) => remove(dots.indexOf(e.target as SVGCircleElement)));
  svg.addEventListener('keydown', (e) => {
    const i = dots.indexOf(e.target as SVGCircleElement);
    if (i < 0) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(i); return; }
    const step = e.shiftKey ? 10 : 1, dv = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
    if (!dv) return;
    e.preventDefault();
    pts[i] = [pts[i][0], clamp(pts[i][1] + dv, min, max)];
    paint();
    onInput(flat());
  });
  paint();
  return { el: root, set(v) {
    const next: number[][] = [];
    for (let i = 0; i + 1 < v.length; i += 2) next.push([v[i], v[i + 1]]);
    if (next.length >= 2) pts = next;
    paint();
  } };
}

export function numberRow(label: string, min: number, max: number, step: number, onChange: (v: number) => void): Row<number> & { input: HTMLInputElement } {
  const root = el(`<label class="cv-field"><span></span><input class="cv-input" type="number" min="${min}" max="${max}" step="${step}"></label>`);
  setText(q(root, 'span'), label);
  const input = q(root, 'input') as HTMLInputElement;
  input.addEventListener('input', () => { const v = input.valueAsNumber; if (Number.isFinite(v)) onChange(v); });
  return { el: root, input, set(v) { setValue(input, fmt(v)); } };
}
