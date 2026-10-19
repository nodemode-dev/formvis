import type { Mat } from './geometry';
import { clamp, type Pt } from './types';

export class Viewport {
  /** Zoom limits. */
  static readonly MIN = 0.01;
  static readonly MAX = 128;
  /** The fixed zoom ladder, in percent, from 1% to 12800%. */
  static readonly LADDER = [1, 2, 3, 4, 5, 6.25, 8.33, 12.5, 16.67, 25, 33.33, 50, 66.67, 100, 150, 200, 300, 400, 500, 600, 800, 1200, 1600, 2400, 3200, 4800, 6400, 9600, 12800];
  /** The next rung of the ladder above or below `z`, or `z` itself when it already sits on the end. */
  static ladderStep(z: number, up: boolean): number {
    const pct = z * 100, eps = 1e-6 * Math.max(1, pct), L = Viewport.LADDER;
    if (up) return (L.find((r) => r > pct + eps) ?? L[L.length - 1]) / 100;
    for (let i = L.length - 1; i >= 0; i--) if (L[i] < pct - eps) return L[i] / 100;
    return L[0] / 100;
  }
  zoom = 1;
  /** View > Flip Horizontal: the view mirrored left to right; the pixels are not. */
  flipped = false;
  /** Where the document origin sits on screen. */
  panX = 0;
  panY = 0;
  /** The view's size in pixels. */
  width = 800;
  height = 600;
  /** True while the view is fitted to the document. */
  fitted = true;
  /** Rotate View (1.49.9): the view turned by this many degrees about the stage's centre; the image is not. */
  rotation = 0;
  /** The width the open side column covers at the view's right (it lies over the canvas, the owner's walkthrough):
   *  fitting and centring use only the visible part. Shared by every document's view; set by the app. */
  static insetRight = 0;
  /** The visible part's centre. */
  get centerX(): number { return (this.width - Viewport.insetRight) / 2; }

  get matrix(): Mat { return [this.zoom, 0, 0, this.zoom, this.panX, this.panY]; }
  toDoc(sx: number, sy: number): Pt { return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom }; }
  toScreen(x: number, y: number): Pt { return { x: x * this.zoom + this.panX, y: y * this.zoom + this.panY }; }

  /** Changes the view's size, keeping its centre over the same document point. */
  resize(w: number, h: number): void {
    this.panX += (w - this.width) / 2;
    this.panY += (h - this.height) / 2;
    this.width = w;
    this.height = h;
  }

  fit(dw: number, dh: number, margin = 32): void {
    const w = this.width - Viewport.insetRight;
    const z = Math.min((w - margin * 2) / dw, (this.height - margin * 2) / dh);
    this.zoom = clamp(Number.isFinite(z) && z > 0 ? z : Viewport.MIN, Viewport.MIN, Viewport.MAX);
    this.panX = Math.round((w - dw * this.zoom) / 2);
    this.panY = Math.round((this.height - dh * this.zoom) / 2);
    this.fitted = true;
  }

  /** Fit Layers and Fit Artboard on Screen (27.11): document rectangle `r` fitted to the visible area and centred. */
  fitRect(r: { x: number; y: number; w: number; h: number }, margin = 32): void {
    const w = this.width - Viewport.insetRight;
    const z = Math.min((w - margin * 2) / Math.max(1, r.w), (this.height - margin * 2) / Math.max(1, r.h));
    this.zoom = clamp(Number.isFinite(z) && z > 0 ? z : Viewport.MIN, Viewport.MIN, Viewport.MAX);
    this.panX = Math.round((w - r.w * this.zoom) / 2 - r.x * this.zoom);
    this.panY = Math.round((this.height - r.h * this.zoom) / 2 - r.y * this.zoom);
    this.fitted = false;
  }

  /** Fill Screen: the zoom at which the image covers the visible area, centred, no margin. */
  fill(dw: number, dh: number): void {
    const w = this.width - Viewport.insetRight;
    const z = Math.max(w / dw, this.height / dh);
    this.zoom = clamp(Number.isFinite(z) && z > 0 ? z : Viewport.MIN, Viewport.MIN, Viewport.MAX);
    this.panX = Math.round((w - dw * this.zoom) / 2);
    this.panY = Math.round((this.height - dh * this.zoom) / 2);
    this.fitted = false;
  }

  /** Zooms to `z` (held to the limits), keeping the document point under the screen point (sx, sy) in place. */
  zoomAt(z: number, sx: number, sy: number): void {
    const next = clamp(z, Viewport.MIN, Viewport.MAX);
    const p = this.toDoc(sx, sy);
    this.zoom = next;
    this.panX = sx - p.x * next;
    this.panY = sy - p.y * next;
    this.fitted = false;
  }

  /** Moves the pan by the given screen offsets. */
  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
    this.fitted = false;
  }
}
