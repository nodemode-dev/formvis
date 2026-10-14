import type { Engine, DocView } from '../engine';

/** Draws a further view of a document into its canvas: the document's flattened picture through the view's own zoom,
 *  pan and rotation. Touches canvas pixels only; the canvas box is sized by the caller. */
export function drawDocView(engine: Engine, view: DocView, canvas: HTMLCanvasElement): void {
  const p = engine.projects.find((x) => x.id === view.projectId);
  const ctx = canvas.getContext('2d');
  if (!p || !ctx || !canvas.width || !canvas.height) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  view.fitIn(w, h, p.doc.width, p.doc.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const src = engine.flattenedOf(p);
  if (!src) return;
  const v = view.viewport;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(w / 2, h / 2);
  ctx.rotate((v.rotation * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);
  ctx.translate(v.panX, v.panY);
  ctx.scale(v.zoom, v.zoom);
  ctx.imageSmoothingEnabled = v.zoom < 2;   // enlarged 2x or more, pixels stay crisp as on the stage
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Matches the canvas backing store to its box (only when different). True when it changed. */
export function fitCanvas(canvas: HTMLCanvasElement): boolean {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  let changed = false;
  if (canvas.width !== w) { canvas.width = w; changed = true; }
  if (canvas.height !== h) { canvas.height = h; changed = true; }
  return changed;
}

/** The view's own gestures: the wheel zooms about the pointer, Alt with the wheel turns the view, a drag pans, a
 *  double click fits. `redraw` repaints this one view; `moved()` is called once a press has travelled (so a tile does
 *  not read the end of a pan as a click). */
export function bindDocView(canvas: HTMLCanvasElement, view: DocView, redraw: () => void, moved: () => void): void {
  const unturn = (sx: number, sy: number): { x: number; y: number } => {
    const v = view.viewport, a = (-v.rotation * Math.PI) / 180, cx = v.width / 2, cy = v.height / 2;
    const dx = sx - cx, dy = sy - cy;
    return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
  };
  const local = (e: MouseEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const v = view.viewport;
    if (e.altKey) {
      const r = v.rotation + (e.deltaY > 0 ? 5 : -5);
      v.rotation = ((((r + 180) % 360) + 360) % 360) - 180;
    } else {
      const at = local(e), pt = unturn(at.x, at.y);
      v.zoomAt(v.zoom * Math.pow(1.0015, -e.deltaY), pt.x, pt.y);
    }
    redraw();
  }, { passive: false });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    const sx = e.clientX, sy = e.clientY;
    let lastX = sx, lastY = sy, travelled = false;
    canvas.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent): void => {
      if (!travelled && Math.hypot(m.clientX - sx, m.clientY - sy) < 4) return;
      travelled = true;
      moved();
      const v = view.viewport, a = (-v.rotation * Math.PI) / 180;
      const dx = m.clientX - lastX, dy = m.clientY - lastY;
      v.panBy(dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a));
      lastX = m.clientX; lastY = m.clientY;
      redraw();
    };
    const up = (): void => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  });
  canvas.addEventListener('dblclick', () => {
    view.viewport.fitted = true;
    view.viewport.width = 0;   // forces the fit on the next draw
    redraw();
  });
}
