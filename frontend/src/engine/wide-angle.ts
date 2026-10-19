/** Adaptive Wide Angle (1.55.8, the parity plan's M4): a wide or fisheye picture reprojected to the rectilinear
 *  (perspective) view, so that lines straight in the world come out straight. The lens model says how the picture
 *  was made: Fisheye (equidistant, r = f theta), Equisolid (r = 2 f sin(theta / 2)), Stereographic (r = 2 f tan(theta
 *  / 2)); Strength is the picture's field of view across its diagonal, from none (the picture as it is) to 180 degrees.
 *  Constraint lines drawn along features that should be straight let the filter find that field of view itself (the
 *  one that makes them straightest) and level the first line. The centre keeps its scale; Scale zooms the result. */

export type RadialModel = 'fisheye' | 'equisolid' | 'stereographic';
/** Perspective turns the camera (keystone) with the lens kept rectilinear; Full Spherical takes an equirectangular
 *  picture to a rectilinear view; Auto picks the model whose result makes the constraints straightest. */
export type LensModel = RadialModel | 'perspective' | 'fullSpherical' | 'auto';
export type Pt2 = { x: number; y: number };
export type Orientation = 'free' | 'horizontal' | 'vertical';
/** A constraint line: points along a feature, and what it should become (free: straight; horizontal; vertical). */
export interface Constraint { pts: Pt2[]; orient: Orientation }

const isRadial = (m: LensModel): m is RadialModel => m === 'fisheye' || m === 'equisolid' || m === 'stereographic';

/** The field of view across the diagonal, radians, for a strength 0 to 1. */
const fovOf = (strength: number): number => Math.max(1e-4, Math.min(1, strength)) * (179 * Math.PI) / 180;

function radiusOf(model: RadialModel, f: number, theta: number): number {
  return model === 'equisolid' ? 2 * f * Math.sin(theta / 2) : model === 'stereographic' ? 2 * f * Math.tan(theta / 2) : f * theta;
}
function thetaOf(model: RadialModel, f: number, r: number): number {
  return model === 'equisolid' ? 2 * Math.asin(Math.min(1, r / (2 * f))) : model === 'stereographic' ? 2 * Math.atan(r / (2 * f)) : r / f;
}

/** `pick` is the model Auto settled on (set by the fit); `tiltX` and `tiltY` turn the camera for Perspective, degrees;
 *  `constraints` with `local` (0 to 1) bend the result so each line comes out straight, level or plumb where it lies. */
export interface WideSettings { model: LensModel; strength: number; scale: number; rotation: number; pick?: Exclude<LensModel, 'auto'>; tiltX?: number; tiltY?: number; constraints?: Constraint[]; local?: number }

/** The model in force: Auto uses what the fit picked, else Full Spherical for a 2 to 1 picture and Fisheye otherwise. */
function concrete(s: WideSettings, W: number, H: number): Exclude<LensModel, 'auto'> {
  return s.model !== 'auto' ? s.model : s.pick ?? (Math.abs(W / H - 2) < 0.05 ? 'fullSpherical' : 'fisheye');
}

/** The lens's focal length in pixels for an image of half-diagonal R. */
function focal(model: RadialModel, strength: number, R: number): number {
  const half = fovOf(strength) / 2;
  return model === 'equisolid' ? R / (2 * Math.sin(half / 2) || 1) : model === 'stereographic' ? R / (2 * Math.tan(half / 2) || 1) : R / half;
}

/** The rectilinear view's focal length for Perspective and Full Spherical: the strength as a field of view across the
 *  diagonal kept between 15 and 150 degrees, 60 when it is none. */
function viewFocal(strength: number, R: number): number {
  const fov = strength > 0 ? Math.min(150, Math.max(15, strength * 179)) : 60;
  return R / Math.tan((fov * Math.PI) / 360);
}

/** The camera turn, row by row: about the horizontal axis by `ax` degrees, then the vertical by `ay`. */
function tiltMatrix(ax: number, ay: number): number[] {
  const a = (ax * Math.PI) / 180, b = (ay * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  return [cb, sb * sa, sb * ca, 0, ca, -sa, -sb, cb * sa, cb * ca];
}

/** A picture point (pixels, image W by H) to its place in the corrected picture. */
export function forward(p: Pt2, W: number, H: number, s: WideSettings): Pt2 | null {
  const cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy), dx = p.x - cx, dy = p.y - cy, model = concrete(s, W, H);
  let ox = dx, oy = dy;
  if (model === 'perspective') {
    const f = viewFocal(s.strength, R), m = tiltMatrix(s.tiltX ?? 0, s.tiltY ?? 0);
    const vx = m[0] * dx + m[3] * dy + m[6] * f, vy = m[1] * dx + m[4] * dy + m[7] * f, vz = m[2] * dx + m[5] * dy + m[8] * f;
    if (vz <= 1e-6) return null;
    ox = (f * vx) / vz; oy = (f * vy) / vz;
  } else if (model === 'fullSpherical') {
    const f = viewFocal(s.strength, R), lon = (p.x / W - 0.5) * 2 * Math.PI, lat = (p.y / H - 0.5) * Math.PI, cl = Math.cos(lat), z = Math.cos(lon) * cl;
    if (z <= 1e-3) return null;
    ox = (f * Math.sin(lon) * cl) / z; oy = (f * Math.sin(lat)) / z;
  } else {
    const r = Math.hypot(dx, dy);
    if (s.strength > 0 && r > 0) {
      const th = thetaOf(model, focal(model, s.strength, R), r);
      if (!(th < Math.PI / 2 - 1e-3)) return null;
      const ro = focal(model, s.strength, R) * Math.tan(th);
      ox = (dx / r) * ro; oy = (dy / r) * ro;
    }
  }
  return rotate({ x: cx + ox * s.scale, y: cy + oy * s.scale }, cx, cy, s.rotation);
}

/** True when the settings leave the picture as it is. */
export function wideIsIdentity(s: WideSettings, W: number, H: number): boolean {
  const m = concrete(s, W, H);
  if (s.scale !== 1 || s.rotation) return false;
  if (m === 'fullSpherical') return false;
  if (m === 'perspective') return !s.tiltX && !s.tiltY && !(s.local && s.constraints?.length);
  return s.strength <= 0 && !(s.local && s.constraints?.length);
}

function rotate(p: Pt2, cx: number, cy: number, deg: number): Pt2 {
  if (!deg) return p;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), x = p.x - cx, y = p.y - cy;
  return { x: cx + x * c - y * sn, y: cy + x * sn + y * c };
}

const usable = (c: Constraint): boolean => c.pts.length >= (c.orient === 'free' ? 3 : 2);

/** Where the best straight line through `q` sits: the point on it nearest each point, or the level or plumb line. */
function straightTargets(q: readonly Pt2[], orient: Orientation): Pt2[] {
  const n = q.length, mx = q.reduce((a, p) => a + p.x, 0) / n, my = q.reduce((a, p) => a + p.y, 0) / n;
  if (orient === 'horizontal') return q.map((p) => ({ x: p.x, y: my }));
  if (orient === 'vertical') return q.map((p) => ({ x: mx, y: p.y }));
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of q) { const x = p.x - mx, y = p.y - my; sxx += x * x; syy += y * y; sxy += x * y; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
  return q.map((p) => { const t = (p.x - mx) * ux + (p.y - my) * uy; return { x: mx + t * ux, y: my + t * uy }; });
}

interface LocalField { cell: number; gw: number; gh: number; d: Float32Array }

/** A coarse grid of shifts, in corrected-picture pixels: each constraint line, cut into short steps and carried through
 *  the model, pulls its neighbourhood by how far it is from its straight (level, plumb) target, with a Gaussian reach. */
function localField(s: WideSettings, W: number, H: number): LocalField | null {
  const cons = (s.constraints ?? []).filter(usable), amount = s.local ?? 0;
  if (!cons.length || amount <= 0) return null;
  const sigma = Math.max(W, H) * 0.06, base = { ...s, rotation: 0, scale: 1, constraints: undefined, local: 0 }, cx = W / 2, cy = H / 2;
  const sites: { x: number; y: number; dx: number; dy: number }[] = [];
  for (const c of cons) {
    const dense: Pt2[] = [];
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const a = c.pts[i], b = c.pts[i + 1], steps = Math.max(1, Math.min(60, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (sigma * 0.4))));
      for (let k = 0; k < steps; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
    }
    dense.push(c.pts[c.pts.length - 1]);
    const q = dense.map((p) => forward(p, W, H, base));
    if (q.some((p) => !p)) continue;
    const pts = q as Pt2[], tg = straightTargets(pts, c.orient);
    pts.forEach((p, i) => sites.push({ x: tg[i].x - cx, y: tg[i].y - cy, dx: (p.x - tg[i].x) * amount, dy: (p.y - tg[i].y) * amount }));
  }
  if (!sites.length) return null;
  const cell = Math.max(8, Math.ceil(Math.sqrt((W * H) / 40000))), gw = Math.ceil(W / cell) + 1, gh = Math.ceil(H / cell) + 1, d = new Float32Array(gw * gh * 2), k2 = -1 / (2 * sigma * sigma);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const x = gx * cell - cx, y = gy * cell - cy;
    let sw = 0, sx = 0, sy = 0;
    for (const t of sites) { const w = Math.exp(((x - t.x) ** 2 + (y - t.y) ** 2) * k2); if (w < 1e-4) continue; sw += w; sx += w * t.dx; sy += w * t.dy; }
    const o = (gy * gw + gx) * 2, den = sw + 0.1;
    d[o] = sx / den; d[o + 1] = sy / den;
  }
  return { cell, gw, gh, d };
}

function fieldAt(f: LocalField, px: number, py: number, out: [number, number]): void {
  const x = Math.min(f.gw - 1.001, Math.max(0, px / f.cell)), y = Math.min(f.gh - 1.001, Math.max(0, py / f.cell)), x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  const o = (y0 * f.gw + x0) * 2, o2 = o + f.gw * 2, d = f.d;
  for (let c = 0; c < 2; c++) out[c] = (d[o + c] * (1 - tx) + d[o + 2 + c] * tx) * (1 - ty) + (d[o2 + c] * (1 - tx) + d[o2 + 2 + c] * tx) * ty;
}

/** The corrected picture: each output pixel goes back through the local shift, the rotation, the rectilinear radius
 *  and the lens model to its place in the picture, sampled bilinearly in premultiplied alpha. */
export function wideAngle(src: ImageData, s: WideSettings): ImageData {
  const { width: W, height: H } = src, out = new ImageData(W, H), o = out.data, d = src.data;
  const cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy), model = concrete(s, W, H), a = (-s.rotation * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const radial: RadialModel | null = isRadial(model) ? model : null, f = radial ? focal(radial, s.strength, R) : viewFocal(s.strength, R), tm = tiltMatrix(s.tiltX ?? 0, s.tiltY ?? 0);
  const field = localField(s, W, H), disp: [number, number] = [0, 0];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let x = i + 0.5 - cx, y = j + 0.5 - cy;
    if (s.rotation) { const rx = x * ca - y * sa, ry = x * sa + y * ca; x = rx; y = ry; }
    x /= s.scale; y /= s.scale;
    if (field) { fieldAt(field, x + cx, y + cy, disp); x += disp[0]; y += disp[1]; }
    const ro = Math.hypot(x, y);
    let u = cx + x, v = cy + y;
    if (radial) {
      if (s.strength > 0 && ro > 0) { const th = Math.atan(ro / f), ri = radiusOf(radial, f, th); u = cx + (x / ro) * ri; v = cy + (y / ro) * ri; }
    } else if (model === 'perspective') {
      const wz = tm[6] * x + tm[7] * y + tm[8] * f;
      if (wz <= 1e-6) continue;
      u = cx + (f * (tm[0] * x + tm[1] * y + tm[2] * f)) / wz; v = cy + (f * (tm[3] * x + tm[4] * y + tm[5] * f)) / wz;
    } else {
      const lon = Math.atan2(x, f), lat = Math.atan2(y, Math.hypot(x, f));
      u = (lon / (2 * Math.PI) + 0.5) * W; v = (lat / Math.PI + 0.5) * H;
      if (u >= W) u -= W; else if (u < 0) u += W;
    }
    u -= 0.5; v -= 0.5;
    if (!(u > -1 && v > -1 && u < W && v < H)) continue;
    const xa = Math.floor(u), ya = Math.floor(v), fx = u - xa, fy = v - ya;
    let r = 0, g = 0, b = 0, al = 0;
    for (const [xx, yy, w] of [[xa, ya, (1 - fx) * (1 - fy)], [xa + 1, ya, fx * (1 - fy)], [xa, ya + 1, (1 - fx) * fy], [xa + 1, ya + 1, fx * fy]] as const) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || w === 0) continue;
      const p = (yy * W + xx) * 4, aw = (d[p + 3] / 255) * w;
      r += d[p] * aw; g += d[p + 1] * aw; b += d[p + 2] * aw; al += aw;
    }
    if (al <= 0) continue;
    const t = (j * W + i) * 4;
    o[t] = r / al; o[t + 1] = g / al; o[t + 2] = b / al; o[t + 3] = al * 255;
  }
  return out;
}

/** How far a constraint's corrected points stray from where it should lie (its best straight line, or the level or
 *  plumb line through them): the RMS distance over the line's length; Infinity when a point falls outside the view. */
function crookedness(c: Constraint, W: number, H: number, s: WideSettings): number {
  const pts = c.pts.map((p) => forward(p, W, H, { ...s, rotation: 0, scale: 1, constraints: undefined, local: 0 }));
  if (pts.some((p) => !p)) return Infinity;
  const q = pts as Pt2[], n = q.length, tg = straightTargets(q, c.orient);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (q[i].x - tg[i].x) ** 2 + (q[i].y - tg[i].y) ** 2;
  const len = Math.hypot(q[n - 1].x - q[0].x, q[n - 1].y - q[0].y) || 1;
  return Math.sqrt(sum / n) / len;
}

const totalCost = (cons: readonly Constraint[], W: number, H: number, s: WideSettings): number => cons.reduce((a, c) => a + crookedness(c, W, H, s), 0);

export interface LensFit { strength: number; tiltX: number; tiltY: number; pick?: Exclude<LensModel, 'auto'> }

/** The strength that makes the constraints straightest: a coarse scan, then a golden-section search near the best. */
function fitStrength(cons: readonly Constraint[], W: number, H: number, model: RadialModel): number {
  if (!cons.length) return 0;
  const cost = (s: number): number => totalCost(cons, W, H, { model, strength: s, scale: 1, rotation: 0 });
  let best = 0, bestC = cost(0);
  for (let s = 0.02; s <= 0.96; s += 0.02) { const c = cost(s); if (c < bestC) { bestC = c; best = s; } }
  let lo = Math.max(0, best - 0.02), hi = Math.min(0.96, best + 0.02);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 24; k++) {
    const a = hi - g * (hi - lo), b = lo + g * (hi - lo);
    if (cost(a) < cost(b)) hi = b; else lo = a;
  }
  return (lo + hi) / 2;
}

/** Perspective: the camera turn (degrees about each axis) that makes the constraints straightest, found by a pattern
 *  search that halves its step; the strength (the lens's field of view) stays as given. */
function fitTilt(cons: readonly Constraint[], W: number, H: number, strength: number): { tiltX: number; tiltY: number; cost: number } {
  const cost = (tx: number, ty: number): number => totalCost(cons, W, H, { model: 'perspective', strength, scale: 1, rotation: 0, tiltX: tx, tiltY: ty });
  let bx = 0, by = 0, bc = cost(0, 0);
  for (let tx = -40; tx <= 40; tx += 8) for (let ty = -40; ty <= 40; ty += 8) { const c = cost(tx, ty); if (c < bc) { bc = c; bx = tx; by = ty; } }
  for (let step = 4; step > 0.02; step /= 2) {
    for (let moved = true, guard = 0; moved && guard < 20; guard++) {
      moved = false;
      for (const [ax, ay] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
        const nx = Math.max(-60, Math.min(60, bx + ax)), ny = Math.max(-60, Math.min(60, by + ay)), c = cost(nx, ny);
        if (c < bc - 1e-12) { bc = c; bx = nx; by = ny; moved = true; }
      }
    }
  }
  return { tiltX: bx, tiltY: by, cost: bc };
}

/** What the constraints say about the lens for `model`: the strength for the radial models, the camera turn for
 *  Perspective, and for Auto the model among those that makes the lines straightest (Full Spherical when there are
 *  no lines and the picture is 2 to 1). */
export function fitLens(constraints: readonly Constraint[], W: number, H: number, model: LensModel, strength = 0): LensFit {
  const cons = constraints.filter(usable), none: LensFit = { strength, tiltX: 0, tiltY: 0 };
  if (model === 'fullSpherical') return none;
  if (isRadial(model)) return { strength: fitStrength(cons, W, H, model), tiltX: 0, tiltY: 0 };
  if (model === 'perspective') { const t = fitTilt(cons, W, H, strength); return { strength, tiltX: t.tiltX, tiltY: t.tiltY }; }
  if (!cons.length) return { ...none, pick: Math.abs(W / H - 2) < 0.05 ? 'fullSpherical' : 'fisheye' };
  let best: LensFit = { strength: 0, tiltX: 0, tiltY: 0, pick: 'fisheye' }, bestC = Infinity;
  for (const m of ['fisheye', 'equisolid', 'stereographic'] as const) {
    const st = fitStrength(cons, W, H, m), c = totalCost(cons, W, H, { model: m, strength: st, scale: 1, rotation: 0 });
    if (c < bestC - 1e-9) { bestC = c; best = { strength: st, tiltX: 0, tiltY: 0, pick: m }; }
  }
  const t = fitTilt(cons, W, H, strength);
  if (t.cost < bestC - 1e-9) best = { strength, tiltX: t.tiltX, tiltY: t.tiltY, pick: 'perspective' };
  return best;
}

/** The rotation, degrees, that makes the first constraint level or plumb after correction: the way it was marked,
 *  or for a free line whichever it is nearer. */
export function levelRotation(c: Constraint, W: number, H: number, s: WideSettings): number {
  if (c.pts.length < 2) return 0;
  const base = { ...s, scale: 1, rotation: 0, constraints: undefined, local: 0 }, a = forward(c.pts[0], W, H, base), b = forward(c.pts[c.pts.length - 1], W, H, base);
  if (!a || !b) return 0;
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, toLevel = -(((ang + 90) % 180 + 180) % 180 - 90), toPlumb = -(((ang % 180) + 180) % 180 - 90);
  if (c.orient === 'horizontal') return toLevel;
  if (c.orient === 'vertical') return toPlumb;
  return Math.abs(toLevel) <= Math.abs(toPlumb) ? toLevel : toPlumb;
}

/** The smart filter: the saved settings applied to a picture. */
export function runWideAngleSmart(o: Record<string, unknown>, src: ImageData): ImageData {
  const models: LensModel[] = ['fisheye', 'equisolid', 'stereographic', 'perspective', 'fullSpherical', 'auto'], num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const model = models.includes(o.model as LensModel) ? (o.model as LensModel) : 'fisheye', orients: Orientation[] = ['free', 'horizontal', 'vertical'];
  const constraints = Array.isArray(o.constraints) ? (o.constraints as unknown[]).flatMap((c): Constraint[] => {
    const r = c as { pts?: unknown; orient?: unknown };
    if (!r || !Array.isArray(r.pts)) return [];
    const pts = (r.pts as unknown[]).filter((p): p is Pt2 => !!p && typeof (p as Pt2).x === 'number' && typeof (p as Pt2).y === 'number').map((p) => ({ x: p.x, y: p.y }));
    return [{ pts, orient: orients.includes(r.orient as Orientation) ? (r.orient as Orientation) : 'free' }];
  }) : [];
  const s: WideSettings = { model, strength: num(o.strength, 0), scale: num(o.scale, 1), rotation: num(o.rotation, 0), tiltX: num(o.tiltX, 0), tiltY: num(o.tiltY, 0), constraints, local: num(o.local, 0) };
  if (typeof o.pick === 'string' && models.includes(o.pick as LensModel) && o.pick !== 'auto') s.pick = o.pick as Exclude<LensModel, 'auto'>;
  return wideIsIdentity(s, src.width, src.height) ? src : wideAngle(src, s);
}
