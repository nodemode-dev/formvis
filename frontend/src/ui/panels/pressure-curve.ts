import { clamp } from '../../engine';
import { el, q, setText } from '../dom';
import type { Row } from './controls';

const NS = 'http://www.w3.org/2000/svg', W = 200, H = 150, SAMPLES = 33;

/** A drawn pen pressure curve: pressure along the box, the response up it. Drag a point, click the box to add one,
 *  double-click or Delete to remove one; the end points keep their pressure and move up and down. The value is the curve
 *  sampled at even steps (what the engine's pressure curve holds), or null while it is the straight line. The nodes are
 *  built once and moved in place. */
export function pressureCurveRow(label: string, onInput: (samples: number[] | null) => void): Row<number[] | null> {
  const root = el('<div class="cv-field"><span></span><svg class="cv-shape-curve" viewBox="0 0 200 150" role="group"></svg></div>'), svg = q(root, 'svg') as unknown as SVGSVGElement;
  setText(q(root, 'span'), label);
  svg.setAttribute('aria-label', label);
  const make = <K extends keyof SVGElementTagNameMap>(tag: K, cls: string): SVGElementTagNameMap[K] => { const n = document.createElementNS(NS, tag); n.setAttribute('class', cls); svg.appendChild(n); return n; };
  const diag = make('line', 'cv-shape-axis'), line = make('path', 'cv-shape-line');
  diag.setAttribute('x1', '0'); diag.setAttribute('y1', String(H)); diag.setAttribute('x2', String(W)); diag.setAttribute('y2', '0');
  let pts: number[][] = [[0, 0], [1, 1]];
  const dots: SVGCircleElement[] = [];
  const X = (t: number): number => t * W, Y = (v: number): number => (1 - v) * H;
  const value = (t: number): number => {
    let i = 1;
    while (i < pts.length - 1 && pts[i][0] < t) i++;
    const a = pts[i - 1], b = pts[i], span = b[0] - a[0];
    return clamp(span <= 0 ? b[1] : a[1] + ((b[1] - a[1]) * (t - a[0])) / span, 0, 1);
  };
  const samples = (): number[] => Array.from({ length: SAMPLES }, (_, i) => Math.round(value(i / (SAMPLES - 1)) * 1000) / 1000);
  const straight = (): boolean => pts.length === 2 && pts[0][1] === 0 && pts[1][1] === 1;
  const emit = (): void => onInput(straight() ? null : samples());
  const paint = (): void => {
    while (dots.length < pts.length) { const d = make('circle', 'cv-shape-dot'); d.setAttribute('r', '5'); d.setAttribute('tabindex', '0'); dots.push(d); }
    while (dots.length > pts.length) dots.pop()?.remove();
    pts.forEach((p, i) => { dots[i].setAttribute('cx', X(p[0]).toFixed(1)); dots[i].setAttribute('cy', Y(p[1]).toFixed(1)); dots[i].setAttribute('aria-label', `${label} point ${i + 1}`); });
    line.setAttribute('d', pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(''));
  };
  const at = (e: PointerEvent): [number, number] => {
    const r = svg.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1), clamp(1 - (e.clientY - r.top) / Math.max(1, r.height), 0, 1)];
  };
  let drag = -1;
  svg.addEventListener('pointerdown', (e) => {
    const hit = dots.indexOf(e.target as SVGCircleElement), [t, v] = at(e);
    if (hit < 0) {
      if (pts.length >= 12) return;
      let k = pts.findIndex((p) => p[0] > t);
      if (k < 1) k = pts.length - 1;
      pts.splice(k, 0, [t, v]);
      drag = k;
      paint();
      emit();
    } else drag = hit;
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const [t, v] = at(e), last = pts.length - 1;
    pts[drag] = [drag === 0 ? 0 : drag === last ? 1 : clamp(t, pts[drag - 1][0] + 0.01, pts[drag + 1][0] - 0.01), v];
    paint();
    emit();
  });
  const drop = (): void => { drag = -1; };
  svg.addEventListener('pointerup', drop);
  svg.addEventListener('pointercancel', drop);
  const remove = (i: number): void => { if (i > 0 && i < pts.length - 1) { pts.splice(i, 1); paint(); emit(); } };
  svg.addEventListener('dblclick', (e) => remove(dots.indexOf(e.target as SVGCircleElement)));
  svg.addEventListener('keydown', (e) => {
    const i = dots.indexOf(e.target as SVGCircleElement);
    if (i < 0) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(i); return; }
    const step = e.shiftKey ? 0.1 : 0.01, dv = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
    if (!dv) return;
    e.preventDefault();
    pts[i] = [pts[i][0], clamp(pts[i][1] + dv, 0, 1)];
    paint();
    emit();
  });
  paint();
  return { el: root, set(v) {
    const now = straight() ? null : samples();
    if (JSON.stringify(now) === JSON.stringify(v ?? null)) return;
    if (!v || v.length < 2) pts = [[0, 0], [1, 1]];
    else {
      const every = v.length > 12 ? Math.ceil((v.length - 1) / 8) : 1, keep = v.map((_, i) => i).filter((i) => i % every === 0 || i === v.length - 1);
      pts = keep.map((i) => [i / (v.length - 1), clamp(v[i], 0, 1)]);
    }
    paint();
  } };
}
