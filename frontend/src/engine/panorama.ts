/** Spherical panorama (DEV_PLAN 35.8): a rectilinear view of an equirectangular picture, and the way back.
 *  Pure pixels, no DOM. Yaw 0 looks at the image's centre column, positive yaw turns right, positive pitch looks up.
 *  Image x = (lon / 360 + 0.5) * W and y = (0.5 - lat / 180) * H, lon and lat in degrees. */

export interface PixelImage { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }
/** yaw and pitch in degrees; fov is the horizontal field of view in degrees. */
export interface PanoramaView { yaw: number; pitch: number; fov: number }
/** What an edit view remembers so its pixels can be put back on the sphere. */
export interface PanoramaLink { sourceProjectId: string; view: PanoramaView; layerId: string | null }

const RAD = Math.PI / 180;

interface Frame { f: [number, number, number]; r: [number, number, number]; u: [number, number, number]; tanH: number; tanV: number }

/** The camera's forward, right and up axes (x right, y up, z toward the centre column) and the half-extents at depth 1. */
function frame(view: PanoramaView, w: number, h: number): Frame {
  const yaw = view.yaw * RAD, pitch = view.pitch * RAD;
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  const fov = Math.min(170, Math.max(1, view.fov)) * RAD, tanH = Math.tan(fov / 2);
  return { f: [cp * sy, sp, cp * cy], r: [cy, 0, -sy], u: [-sp * sy, cp, -sp * cy], tanH, tanV: tanH * h / w };
}

const wrapPi = (a: number): number => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

/** Bilinear read of `img` at (x, y) in pixel-centre coordinates into `out`[0..3], x wrapped when `wrapX`, else clamped. */
function sample(img: PixelImage, x: number, y: number, wrapX: boolean, out: number[]): void {
  const { data, width: w, height: h } = img;
  const x0f = Math.floor(x), y0f = Math.floor(y), fx = x - x0f, fy = y - y0f;
  const cx = (v: number): number => (wrapX ? ((v % w) + w) % w : Math.min(w - 1, Math.max(0, v)));
  const cyy = (v: number): number => Math.min(h - 1, Math.max(0, v));
  const xs = [cx(x0f), cx(x0f + 1)], ys = [cyy(y0f), cyy(y0f + 1)];
  const wt = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  let r = 0, g = 0, b = 0, a = 0;
  for (let k = 0; k < 4; k++) {
    const i = (ys[k >> 1] * w + xs[k & 1]) * 4, al = data[i + 3] * wt[k];
    r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al;
  }
  out[3] = a;
  if (a > 0) { out[0] = r / a; out[1] = g / a; out[2] = b / a; } else { out[0] = 0; out[1] = 0; out[2] = 0; }
}

/** A perspective view of an equirectangular picture, `outW` by `outH`, bilinear, longitude wrapping and latitude clamped. */
export function renderView(equi: PixelImage, view: PanoramaView, outW: number, outH: number): PixelImage {
  const w = Math.max(1, Math.round(outW)), h = Math.max(1, Math.round(outH)), out = new Uint8ClampedArray(w * h * 4);
  if (equi.width < 1 || equi.height < 1) return { data: out, width: w, height: h };
  const fr = frame(view, w, h), px = [0, 0, 0, 0];
  for (let j = 0; j < h; j++) {
    const ny = (1 - ((j + 0.5) / h) * 2) * fr.tanV;
    for (let i = 0; i < w; i++) {
      const nx = (((i + 0.5) / w) * 2 - 1) * fr.tanH;
      const dx = fr.f[0] + nx * fr.r[0] + ny * fr.u[0], dy = fr.f[1] + nx * fr.r[1] + ny * fr.u[1], dz = fr.f[2] + nx * fr.r[2] + ny * fr.u[2];
      const lon = Math.atan2(dx, dz), lat = Math.atan2(dy, Math.hypot(dx, dz));
      sample(equi, (lon / (2 * Math.PI) + 0.5) * equi.width - 0.5, (0.5 - lat / Math.PI) * equi.height - 0.5, true, px);
      const o = (j * w + i) * 4;
      out[o] = px[0]; out[o + 1] = px[1]; out[o + 2] = px[2]; out[o + 3] = px[3];
    }
  }
  return { data: out, width: w, height: h };
}

/** The inverse: every equirect pixel whose direction falls inside the view's frustum takes `viewImg` (bilinear) composited
 *  source-over onto `equi` by the view picture's alpha. Returns a new image; pixels outside the frustum are untouched. */
export function projectBack(equi: PixelImage, viewImg: PixelImage, view: PanoramaView): PixelImage {
  const W = equi.width, H = equi.height, out: PixelImage = { data: new Uint8ClampedArray(equi.data), width: W, height: H };
  const vw = viewImg.width, vh = viewImg.height;
  if (W < 1 || H < 1 || vw < 1 || vh < 1) return out;
  const fr = frame(view, vw, vh);
  // Lon/lat bounding box of the frustum: walk its border, and open the longitude fully when a pole lies inside.
  let latMin = Infinity, latMax = -Infinity, dMin = Infinity, dMax = -Infinity;
  const steps = 96, centre = view.yaw * RAD;
  for (let s = 0; s < steps * 4; s++) {
    const side = Math.floor(s / steps), t = ((s % steps) / steps) * 2 - 1;
    const nx = (side === 0 ? t : side === 1 ? 1 : side === 2 ? -t : -1) * fr.tanH, ny = (side === 0 ? 1 : side === 1 ? -t : side === 2 ? -1 : t) * fr.tanV;
    const dx = fr.f[0] + nx * fr.r[0] + ny * fr.u[0], dy = fr.f[1] + nx * fr.r[1] + ny * fr.u[1], dz = fr.f[2] + nx * fr.r[2] + ny * fr.u[2];
    const lat = Math.atan2(dy, Math.hypot(dx, dz)), d = wrapPi(Math.atan2(dx, dz) - centre);
    latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat); dMin = Math.min(dMin, d); dMax = Math.max(dMax, d);
  }
  const poleInside = (sign: number): boolean => {
    const depth = sign * fr.f[1];
    if (depth <= 1e-6) return false;
    return Math.abs((sign * fr.r[1]) / depth) <= fr.tanH && Math.abs((sign * fr.u[1]) / depth) <= fr.tanV;
  };
  let full = false;
  if (poleInside(1)) { latMax = Math.PI / 2; full = true; }
  if (poleInside(-1)) { latMin = -Math.PI / 2; full = true; }
  const y0 = Math.max(0, Math.floor((0.5 - latMax / Math.PI) * H) - 2), y1 = Math.min(H - 1, Math.ceil((0.5 - latMin / Math.PI) * H) + 2);
  const xc = (centre / (2 * Math.PI) + 0.5) * W, xa = Math.floor(xc + (dMin / (2 * Math.PI)) * W) - 2, xb = Math.ceil(xc + (dMax / (2 * Math.PI)) * W) + 2;
  const count = full || xb - xa + 1 >= W ? W : xb - xa + 1, start = full || xb - xa + 1 >= W ? 0 : xa;
  const px = [0, 0, 0, 0], data = out.data;
  for (let y = y0; y <= y1; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let k = 0; k < count; k++) {
      const x = (((start + k) % W) + W) % W, lon = ((x + 0.5) / W - 0.5) * 2 * Math.PI;
      const dx = cl * Math.sin(lon), dy = sl, dz = cl * Math.cos(lon);
      const depth = dx * fr.f[0] + dy * fr.f[1] + dz * fr.f[2];
      if (depth <= 1e-6) continue;
      const nx = (dx * fr.r[0] + dy * fr.r[1] + dz * fr.r[2]) / depth, ny = (dx * fr.u[0] + dy * fr.u[1] + dz * fr.u[2]) / depth;
      if (Math.abs(nx) > fr.tanH || Math.abs(ny) > fr.tanV) continue;
      sample(viewImg, ((nx / fr.tanH + 1) / 2) * vw - 0.5, ((1 - ny / fr.tanV) / 2) * vh - 0.5, false, px);
      const sa = px[3] / 255;
      if (sa <= 0) continue;
      const o = (y * W + x) * 4, da = data[o + 3] / 255, oa = sa + da * (1 - sa);
      data[o] = (px[0] * sa + data[o] * da * (1 - sa)) / oa;
      data[o + 1] = (px[1] * sa + data[o + 1] * da * (1 - sa)) / oa;
      data[o + 2] = (px[2] * sa + data[o + 2] * da * (1 - sa)) / oa;
      data[o + 3] = oa * 255;
    }
  }
  return out;
}
