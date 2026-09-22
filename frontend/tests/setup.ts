/** Node has no ImageData; the engine's pure modules only need its shape. */
if (typeof (globalThis as { ImageData?: unknown }).ImageData === 'undefined') {
  class ImageDataShim {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    readonly colorSpace = 'srgb';
    constructor(a: Uint8ClampedArray | number, b: number, c?: number) {
      if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
      else { this.data = a; this.width = b; this.height = c ?? a.length / 4 / b; }
    }
  }
  (globalThis as { ImageData?: unknown }).ImageData = ImageDataShim;
}

export const px = (...rgba: number[]): Uint8ClampedArray => new Uint8ClampedArray(rgba);
