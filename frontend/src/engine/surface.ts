import { uid, type Rect } from './types';

export type Surface = OffscreenCanvas | HTMLCanvasElement;
export type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** What one browser canvas holds (Chrome's limits): past it a canvas is made but silently draws nothing. */
export const CANVAS_PIXELS = 268_435_456, CANVAS_SIDE = 32_767;

export function createSurface(w: number, h: number): Surface {
  const width = Math.max(1, Math.ceil(w)), height = Math.max(1, Math.ceil(h));
  // Refused out loud (1.62.3): an operation not yet taught tiles, on a document past one canvas, stops with this
  // rather than working on a canvas that is not there (painting had given a 600 MP layer such a canvas).
  if (width * height > CANVAS_PIXELS || width > CANVAS_SIDE || height > CANVAS_SIDE) {
    throw new Error(`A picture of ${width.toLocaleString('en-US')} by ${height.toLocaleString('en-US')} is past what a browser canvas holds (268 megapixels, 32,767 a side); this does not work on documents that large yet.`);
  }
  let s: Surface;
  if (typeof OffscreenCanvas !== 'undefined') s = new OffscreenCanvas(width, height);
  else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    s = canvas;
  }
  if (READS_ON_CPU) s.getContext('2d', { willReadFrequently: true });
  return s;
}

/** WebKit (the desktop app on macOS and Linux, and Safari) keeps a 2D canvas on the GPU unless it is told at birth that
 *  it will be read (1.86.2), and each getImageData is then a wait on the GPU. formvis reads layer pixels in nearly every
 *  brush, filter and selection; Chrome moves such a canvas to the CPU by itself after a few reads, which is why the
 *  browser build was quick and the Mac app was not. The first getContext fixes a canvas's attributes, so it is asked
 *  here, before any other code touches the surface. Chrome is left to its own heuristic. */
const READS_ON_CPU = typeof navigator !== 'undefined' && /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg\//.test(navigator.userAgent);

/** The surface's 2D context; throws when the browser gives none. */
export function ctxOf(s: Surface): Ctx2D {
  const ctx = s.getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error('The 2D canvas is unavailable');
  return ctx;
}

/** Resizes a surface, touching each side only when it changes (assigning clears a canvas). */
export function sizeSurface(s: Surface, w: number, h: number): void {
  const width = Math.max(1, Math.ceil(w)), height = Math.max(1, Math.ceil(h));
  if (s.width !== width) s.width = width;
  if (s.height !== height) s.height = height;
}

/** Encodes a surface to an image blob. */
export function toBlob(s: Surface, type = 'image/png', quality?: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && s instanceof OffscreenCanvas) return s.convertToBlob({ type, quality });
  return new Promise<Blob>((resolve, reject) => {
    (s as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding the image produced nothing'))), type, quality);
  });
}

// Remembers which Raster owns each surface, so a bare canvas can be traced back to its raster.
const owners = new WeakMap<object, Raster>();
export const rasterOf = (canvas: CanvasImageSource): Raster | undefined => owners.get(canvas as object);

/** A pixel buffer: a surface with its context and a version counter bumped whenever the pixels change. */
export class Raster {
  readonly id = uid();
  version = 0;
  readonly canvas: Surface;
  readonly ctx: Ctx2D;

  constructor(readonly width: number, readonly height: number) {
    this.canvas = createSurface(width, height);
    this.ctx = ctxOf(this.canvas);
    owners.set(this.canvas, this);
  }

  /** A raster of the given size with src drawn scaled over all of it. */
  static from(src: CanvasImageSource, width: number, height: number): Raster {
    const r = new Raster(width, height);
    (r.ctx as CanvasRenderingContext2D).drawImage(src, 0, 0, width, height);
    return r;
  }

  /** A raster filled with a css style. */
  static filled(width: number, height: number, style: string): Raster {
    const r = new Raster(width, height);
    r.ctx.fillStyle = style;
    r.ctx.fillRect(0, 0, width, height);
    return r;
  }

  clone(): Raster {
    const r = new Raster(this.width, this.height);
    (r.ctx as CanvasRenderingContext2D).drawImage(this.canvas as CanvasImageSource, 0, 0);
    return r;
  }
  read(x = 0, y = 0, w = this.width, h = this.height): ImageData { return this.ctx.getImageData(x, y, w, h); }
  write(data: ImageData, x = 0, y = 0): void { this.ctx.putImageData(data, x, y); this.version++; this.note({ x, y, w: data.width, h: data.height }); }
  /** Marks the pixels changed; with `r` the change is known to lie inside it, so a GPU texture re-uploads only that part. */
  touch(r?: Rect): void { this.version++; this.note(r ?? null); }
  private damage: Array<{ v: number; r: Rect | null }> = [];
  private note(r: Rect | null): void {
    this.damage.push({ v: this.version, r });
    if (this.damage.length > 32) this.damage.shift();
  }
  /** The rectangle that changed after version `from` up to `to`, or null when any of those changes has no rectangle or has left the log. */
  damageSince(from: number, to: number = this.version): Rect | null { return damageBetween(this.damage, from, to); }
  get bytes(): number { return this.width * this.height * 4; }
}

type Damage = ReadonlyArray<{ v: number; r: Rect | null }>;
function damageBetween(log: Damage, from: number, to: number): Rect | null {
  if (!(to > from)) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (const d of log) {
    if (d.v <= from || d.v > to) continue;
    if (!d.r) return null;
    n++;
    x0 = Math.min(x0, d.r.x); y0 = Math.min(y0, d.r.y); x1 = Math.max(x1, d.r.x + d.r.w); y1 = Math.max(y1, d.r.y + d.r.h);
  }
  return n === to - from ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** The damage log of a surface that is not a Raster (a stroke's working copy, which a live preview draws from): each
 *  note bumps its version, a note without a rectangle says the whole surface changed. */
class SurfaceLog {
  version = 0;
  private damage: Array<{ v: number; r: Rect | null }> = [];
  note(r: Rect | null): void {
    this.damage.push({ v: ++this.version, r });
    if (this.damage.length > 32) this.damage.shift();
  }
  damageSince(from: number, to: number = this.version): Rect | null { return damageBetween(this.damage, from, to); }
}
const surfaceLogs = new WeakMap<object, SurfaceLog>();
export function noteSurface(s: object, r: Rect | null): void {
  let log = surfaceLogs.get(s);
  if (!log) surfaceLogs.set(s, log = new SurfaceLog());
  log.note(r);
}
/** The version of a noted surface, or -1 when nothing tracks it (a display then sends it whole every frame). */
export const surfaceVersion = (s: object): number => surfaceLogs.get(s)?.version ?? -1;
/** What changed in an image since a version: its Raster's log, or the log of a noted surface. */
export const damageOf = (image: object): { damageSince(from: number, to?: number): Rect | null } | undefined => rasterOf(image as CanvasImageSource) ?? surfaceLogs.get(image);
