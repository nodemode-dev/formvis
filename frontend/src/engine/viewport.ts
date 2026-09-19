import type { Mat } from './geometry';
import { clamp, type Pt } from './types';

export class Viewport {
  static readonly MIN = 0.01;
  static readonly MAX = 64;
  zoom = 1;
  panX = 0;
  panY = 0;
  width = 800;
  height = 600;
  fitted = true;

  get matrix(): Mat { return [this.zoom, 0, 0, this.zoom, this.panX, this.panY]; }
  toDoc(sx: number, sy: number): Pt { return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom }; }
  toScreen(x: number, y: number): Pt { return { x: x * this.zoom + this.panX, y: y * this.zoom + this.panY }; }

  resize(w: number, h: number): void {
    this.panX += (w - this.width) / 2;
    this.panY += (h - this.height) / 2;
    this.width = w;
    this.height = h;
  }

  fit(dw: number, dh: number, margin = 32): void {
    const z = Math.min((this.width - margin * 2) / dw, (this.height - margin * 2) / dh);
    this.zoom = clamp(Number.isFinite(z) && z > 0 ? z : Viewport.MIN, Viewport.MIN, Viewport.MAX);
    this.panX = Math.round((this.width - dw * this.zoom) / 2);
    this.panY = Math.round((this.height - dh * this.zoom) / 2);
    this.fitted = true;
  }

  zoomAt(z: number, sx: number, sy: number): void {
    const p = this.toDoc(sx, sy);
    this.zoom = clamp(z, Viewport.MIN, Viewport.MAX);
    this.panX = sx - p.x * this.zoom;
    this.panY = sy - p.y * this.zoom;
    this.fitted = false;
  }

  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
    this.fitted = false;
  }
}
