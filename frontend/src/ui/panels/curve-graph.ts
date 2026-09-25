/** A point-curve graph (256 by 256): click to add a point, drag to shape the curve, drag a point off the graph to remove
 *  it; the end points stay at the ends. The same interaction as the Curves adjustment's graph, as a component the
 *  Develop filter's Point Curve uses. `table` turns the points into the 256-entry curve that is drawn. */

export interface CurvePt { x: number; y: number }

const themeColour = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function curveGraph(opts: { points: () => CurvePt[]; table: (pts: CurvePt[]) => ArrayLike<number>; changed: () => void }): { el: HTMLCanvasElement; draw: () => void } {
  const canvas = document.createElement('canvas');
  canvas.className = 'cv-curves';
  canvas.width = 256;
  canvas.height = 256;
  let drag: number | null = null, removing = false;
  const draw = (): void => {
    const c = canvas.getContext('2d');
    if (!c) return;
    const grid = themeColour('--border-light'), accent = themeColour('--accent-color'), ink = themeColour('--text-primary');
    c.clearRect(0, 0, 256, 256);
    c.strokeStyle = grid;
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < 4; i++) { const v = i * 64 + 0.5; c.moveTo(v, 0); c.lineTo(v, 256); c.moveTo(0, v); c.lineTo(256, v); }
    c.moveTo(0, 256); c.lineTo(256, 0);
    c.stroke();
    const t = opts.table(opts.points());
    c.strokeStyle = accent;
    c.lineWidth = 2;
    c.beginPath();
    for (let x = 0; x < 256; x++) { const y = 255.5 - t[x]; if (x) c.lineTo(x + 0.5, y); else c.moveTo(0.5, y); }
    c.stroke();
    opts.points().forEach((q, i) => { c.fillStyle = i === drag && removing ? grid : ink; c.fillRect(q.x - 3.5, 255 - q.y - 3.5, 7, 7); });
  };
  const local = (e: PointerEvent): CurvePt & { outside: boolean } => {
    const b = canvas.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * 255, y: (1 - (e.clientY - b.top) / b.height) * 255,
      outside: e.clientX < b.left - 16 || e.clientX > b.right + 16 || e.clientY < b.top - 16 || e.clientY > b.bottom + 16 };
  };
  canvas.addEventListener('pointerdown', (e) => {
    const p = local(e), list = opts.points();
    let hit = list.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= 8);
    if (hit < 0) {
      const x = clamp(Math.round(p.x), 0, 255);
      if (list.some((q) => q.x === x)) return;
      list.push({ x, y: clamp(Math.round(p.y), 0, 255) });
      list.sort((a, b) => a.x - b.x);
      hit = list.findIndex((q) => q.x === x);
      opts.changed();
    }
    drag = hit;
    removing = false;
    canvas.setPointerCapture(e.pointerId);
    draw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag === null) return;
    const list = opts.points(), p = local(e);
    const lo = drag === 0 ? 0 : list[drag - 1].x + 1, hi = drag === list.length - 1 ? 255 : list[drag + 1].x - 1;
    list[drag] = { x: clamp(Math.round(p.x), lo, hi), y: clamp(Math.round(p.y), 0, 255) };
    removing = p.outside && drag > 0 && drag < list.length - 1;
    draw();
    opts.changed();
  });
  const end = (e: PointerEvent): void => {
    if (drag === null) return;
    if (removing) { opts.points().splice(drag, 1); opts.changed(); }
    drag = null;
    removing = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    draw();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  return { el: canvas, draw };
}
