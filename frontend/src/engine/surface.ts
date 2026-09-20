import { uid } from './types';

export type Surface = OffscreenCanvas | HTMLCanvasElement;
export type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export function createSurface(w: number, h: number): Surface {
  const width = Math.max(1, Math.ceil(w)), height = Math.max(1, Math.ceil(h));
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
