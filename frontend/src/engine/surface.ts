import { uid } from './types';

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
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function ctxOf(s: Surface): Ctx2D {
  const ctx = (s as HTMLCanvasElement).getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error('2D canvas is unavailable');
  return ctx;
}

export function sizeSurface(s: Surface, w: number, h: number): void {
  const width = Math.max(1, Math.ceil(w)), height = Math.max(1, Math.ceil(h));
  if (s.width !== width) s.width = width;
  if (s.height !== height) s.height = height;
}

export function toBlob(s: Surface, type = 'image/png', quality?: number): Promise<Blob> {
  if ('convertToBlob' in s) return (s as OffscreenCanvas).convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    (s as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('encoding failed'))), type, quality);
  });
}

/** The raster that owns a canvas, so a renderer given only the canvas can read its version. */
const owners = new WeakMap<Surface, Raster>();
export const rasterOf = (canvas: CanvasImageSource): Raster | undefined => owners.get(canvas as Surface);

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

  static from(src: CanvasImageSource, width: number, height: number): Raster {
    const r = new Raster(width, height);
    r.ctx.drawImage(src, 0, 0, width, height);
    return r;
  }

  static filled(width: number, height: number, style: string): Raster {
    const r = new Raster(width, height);
    r.ctx.fillStyle = style;
    r.ctx.fillRect(0, 0, width, height);
    return r;
  }

  clone(): Raster { return Raster.from(this.canvas, this.width, this.height); }
  read(x = 0, y = 0, w = this.width, h = this.height): ImageData { return this.ctx.getImageData(x, y, w, h); }
  write(data: ImageData, x = 0, y = 0): void { this.ctx.putImageData(data, x, y); this.version += 1; }
  touch(): void { this.version += 1; }
  get bytes(): number { return this.width * this.height * 4; }
}
